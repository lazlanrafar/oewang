// Command worker is apps/worker's entrypoint: it wires config, Postgres,
// Redis/asynq, all task handlers, the periodic schedule, and a small HTTP
// server (health + enqueue) together, then runs until SIGINT/SIGTERM.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	goredis "github.com/redis/go-redis/v9"

	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/apiclient"
	"github.com/oewang/worker/internal/config"
	"github.com/oewang/worker/internal/db"
	"github.com/oewang/worker/internal/enqueue"
	"github.com/oewang/worker/internal/health"
	"github.com/oewang/worker/internal/repo"
	"github.com/oewang/worker/internal/tasks"
	"github.com/oewang/worker/internal/telegram"
)

// Cron specs: daily jobs run at an off-peak hour, weekly at an off-peak
// day+hour. See plan §3/§main.go design notes.
const (
	cronDaily  = "0 3 * * *" // 03:00 every day
	cronWeekly = "0 4 * * 0" // 04:00 every Sunday
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("worker: config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("worker: postgres: %v", err)
	}
	defer pool.Close()

	redisConnOpt, err := asynq.ParseRedisURI(cfg.RedisURL)
	if err != nil {
		log.Fatalf("worker: parse REDIS_URL: %v", err)
	}

	redisOpts, err := goredis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("worker: parse REDIS_URL for health check: %v", err)
	}
	rdb := goredis.NewClient(redisOpts)
	defer rdb.Close()

	asynqClient := asynq.NewClient(redisConnOpt)
	defer asynqClient.Close()

	httpClient := apiclient.New()

	// --- Task handlers ---
	billing := &tasks.BillingLifecycleHandler{Client: httpClient, APIInternalURL: cfg.APIInternalURL, WorkerAPIKey: cfg.WorkerAPIKey}
	storage := &tasks.StorageViolationsHandler{Client: httpClient, APIInternalURL: cfg.APIInternalURL, WorkerAPIKey: cfg.WorkerAPIKey}

	aiSidecar := aiclient.New(cfg.AIServiceURL, cfg.AIServiceAPIKey)
	telegramWebhook := &tasks.TelegramWebhookHandler{
		Telegram:      telegram.New(cfg.TelegramBotToken),
		AI:            aiSidecar,
		Integrations:  &repo.IntegrationsRepo{Pool: pool},
		AiSessions:    &repo.AiRepo{Pool: pool},
		Notifications: &repo.NotificationsRepo{Pool: pool},
		Redis:         &tasks.RedisCache{Client: rdb},
	}
	mayarWebhook := &tasks.MayarWebhookHandler{Client: httpClient, APIInternalURL: cfg.APIInternalURL, WorkerAPIKey: cfg.WorkerAPIKey}
	invoiceOverdue := &tasks.InvoiceOverdueHandler{Pool: pool, Client: httpClient, APIInternalURL: cfg.APIInternalURL, WorkerAPIKey: cfg.WorkerAPIKey}
	transactionsImport := &tasks.TransactionsImportHandler{AI: aiSidecar, Store: &repo.TransactionsRepo{Pool: pool}, Jobs: &repo.ImportJobsRepo{Pool: pool}}
	quotaReset := &tasks.QuotaResetAllHandler{Client: httpClient, AIServiceURL: cfg.AIServiceURL, AIServiceAPIKey: cfg.AIServiceAPIKey}
	anomalyScan := &tasks.AnomalyScanAllHandler{Client: httpClient, AIServiceURL: cfg.AIServiceURL, AIServiceAPIKey: cfg.AIServiceAPIKey}
	auditPurge := &tasks.AuditPurgeHandler{Pool: pool}
	softDeletedPurge := &tasks.SoftDeletedPurgeHandler{Pool: pool}

	mux := asynq.NewServeMux()
	mux.HandleFunc(tasks.TypeBillingLifecycle, billing.Handle)
	mux.HandleFunc(tasks.TypeStorageViolations, storage.Handle)
	mux.HandleFunc(tasks.TypeTelegramWebhookProcess, telegramWebhook.Handle)
	mux.HandleFunc(tasks.TypeMayarWebhookProcess, mayarWebhook.Handle)
	mux.HandleFunc(tasks.TypeInvoiceDetectOverdue, invoiceOverdue.Handle)
	mux.HandleFunc(tasks.TypeTransactionsImport, transactionsImport.Handle)
	mux.HandleFunc(tasks.TypeQuotaResetAll, quotaReset.Handle)
	mux.HandleFunc(tasks.TypeAnomalyScanAll, anomalyScan.Handle)
	mux.HandleFunc(tasks.TypeAuditPurge, auditPurge.Handle)
	mux.HandleFunc(tasks.TypeSoftDeletedPurge, softDeletedPurge.Handle)

	// Two queues, weighted so webhook bursts (critical) don't starve behind
	// a slow periodic batch job (default).
	asynqServer := asynq.NewServer(redisConnOpt, asynq.Config{
		Concurrency: 10,
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
		},
	})
	if err := asynqServer.Start(mux); err != nil {
		log.Fatalf("worker: asynq server start: %v", err)
	}
	defer asynqServer.Shutdown()

	scheduler := asynq.NewScheduler(redisConnOpt, &asynq.SchedulerOpts{})
	registerPeriodicTasks(scheduler, cfg)
	if err := scheduler.Start(); err != nil {
		log.Fatalf("worker: asynq scheduler start: %v", err)
	}
	defer scheduler.Shutdown()

	// --- HTTP server: health + enqueue ---
	httpMux := http.NewServeMux()
	httpMux.HandleFunc("GET /health", health.Handler(pool, health.PingFunc(func(ctx context.Context) error {
		return rdb.Ping(ctx).Err()
	})))
	httpMux.HandleFunc("POST /internal/enqueue/{kind}", enqueue.Handler(asynqClient, cfg.WorkerAPIKey))

	httpServer := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: httpMux,
	}

	go func() {
		log.Printf("worker: HTTP server listening on :%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("worker: HTTP server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("worker: shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("worker: HTTP server shutdown error: %v", err)
	}
	log.Println("worker: shutdown complete")
}

// registerPeriodicTasks registers every periodic entry from the task
// table. The anomaly scan is only registered when cfg.AnomalyScanHours > 0
// (mirrors apps/ai's own ANOMALY_SCAN_HOURS: 0 = disabled/opt-in).
func registerPeriodicTasks(scheduler *asynq.Scheduler, cfg *config.Config) {
	registerOrFatal := func(name, cronSpec string, newTask func() (*asynq.Task, error), queue string) {
		task, err := newTask()
		if err != nil {
			log.Fatalf("worker: build periodic task %s: %v", name, err)
		}
		if _, err := scheduler.Register(cronSpec, task, asynq.Queue(queue)); err != nil {
			log.Fatalf("worker: register periodic task %s: %v", name, err)
		}
	}

	registerOrFatal("billing_lifecycle", cronDaily, tasks.NewBillingLifecycleTask, "default")
	registerOrFatal("storage_violations", cronDaily, tasks.NewStorageViolationsTask, "default")
	registerOrFatal("invoice_overdue", cronDaily, tasks.NewInvoiceOverdueTask, "default")
	registerOrFatal("quota_reset_all", cronDaily, tasks.NewQuotaResetAllTask, "default")
	registerOrFatal("audit_purge", cronWeekly, tasks.NewAuditPurgeTask, "default")
	registerOrFatal("soft_deleted_purge", cronWeekly, tasks.NewSoftDeletedPurgeTask, "default")

	if cfg.AnomalyScanHours > 0 {
		cronSpec := fmt.Sprintf("@every %dh", cfg.AnomalyScanHours)
		registerOrFatal("anomaly_scan_all", cronSpec, tasks.NewAnomalyScanAllTask, "default")
	}
}
