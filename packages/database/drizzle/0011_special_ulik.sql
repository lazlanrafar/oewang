ALTER TABLE "pricing" ADD COLUMN "prices" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "price_monthly";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "price_yearly";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "price_one_time";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "stripe_price_id_monthly";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "stripe_price_id_yearly";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "stripe_price_id_one_time";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "currency";