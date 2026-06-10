"use client";

import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";

const PRICING_COPY = {
  en: {
    starter: {
      description: "For simple daily transaction tracking.",
      features: [
        "Transaction tracking and categorization",
        "Up to 3 wallets",
        "Weekly spending insights",
        "1 workspace member",
      ],
      cta: "Get started free",
      note: "No credit card required",
    },
    personal: {
      description: "Best value for personal daily tracking.",
      features: [
        "Everything in Starter",
        "Unlimited wallets",
        "Daily spending insights",
        "100,000 AI tokens included",
        "2GB receipt vault",
      ],
      cta: "Start Personal",
      note: "Best for Indonesian daily use",
    },
    pro: {
      description: "For heavier tracking and shared household workflows.",
      features: [
        "Everything in Starter",
        "Unlimited wallets",
        "Advanced insights and reports",
        "Up to 10 workspaces",
        "400,000 AI tokens included",
        "Role-based access",
      ],
      cta: "Start free trial",
      note: "14-day trial · Cancel anytime",
    },
    business: {
      description: "For small teams that need shared financial control.",
      features: [
        "Everything in Pro",
        "Unlimited workspace members",
        "1,500,000 AI tokens included",
        "Audit log and controls",
        "Priority support",
        "API and integrations",
      ],
      cta: "Contact sales",
      note: "Custom onboarding available",
    },
    monthly: "/month",
    annual: "Displayed in IDR for Indonesia. Checkout supports localized IDR, USD, and EUR pricing. Taxes may apply.",
    comingSoon: "Coming soon",
    mostPopular: "Most popular",
  },
  id: {
    starter: {
      description: "Untuk mencatat transaksi harian secara sederhana.",
      features: [
        "Pelacakan dan kategorisasi transaksi",
        "Hingga 3 wallet",
        "Insight pengeluaran mingguan",
        "1 anggota workspace",
      ],
      cta: "Mulai gratis",
      note: "Tanpa kartu kredit",
    },
    personal: {
      description: "Paling hemat untuk tracking keuangan pribadi harian.",
      features: [
        "Semua fitur Starter",
        "Wallet tanpa batas",
        "Insight pengeluaran harian",
        "Termasuk 100.000 token AI",
        "Vault kwitansi 2GB",
      ],
      cta: "Mulai Personal",
      note: "Harga terbaik untuk pemakaian harian Indonesia",
    },
    pro: {
      description: "Untuk tracking lebih aktif dan kebutuhan keluarga.",
      features: [
        "Semua fitur Starter",
        "Wallet tanpa batas",
        "Insight dan laporan lanjutan",
        "Hingga 10 workspace",
        "Termasuk 400.000 token AI",
        "Akses berbasis peran",
      ],
      cta: "Mulai uji coba gratis",
      note: "Uji coba 14 hari · Bisa batal kapan saja",
    },
    business: {
      description: "Untuk tim kecil yang butuh kontrol keuangan bersama.",
      features: [
        "Semua fitur Pro",
        "Anggota workspace tanpa batas",
        "Termasuk 1.500.000 token AI",
        "Audit log dan kontrol",
        "Dukungan prioritas",
        "API dan integrasi",
      ],
      cta: "Hubungi sales",
      note: "Onboarding khusus tersedia",
    },
    monthly: "/bulan",
    annual:
      "Ditampilkan dalam IDR untuk Indonesia. Checkout mendukung harga lokal IDR, USD, dan EUR. Pajak dapat berlaku.",
    comingSoon: "Segera hadir",
    mostPopular: "Paling populer",
  },
  ja: {
    starter: {
      description: "個人の資金管理とソロ運用向け。",
      features: ["取引の追跡と自動分類", "最大3ウォレット", "週間支出インサイト", "1ワークスペースメンバー"],
      cta: "無料で始める",
      note: "クレジットカード不要",
    },
    personal: {
      description: "日々の個人支出管理に最適なプラン。",
      features: [
        "Starterの全機能",
        "無制限ウォレット",
        "日次支出インサイト",
        "AIトークン100,000/月を含む",
        "2GBレシートVault",
      ],
      cta: "Personalを開始",
      note: "インドネシアの日常利用向け",
    },
    pro: {
      description: "より多くの記録や家計共有が必要な方向け。",
      features: [
        "Starterの全機能",
        "無制限ウォレット",
        "高度な分析とレポート",
        "最大10ワークスペース",
        "AIトークン400,000/月を含む",
        "ロールベース権限",
      ],
      cta: "無料トライアルを開始",
      note: "14日間トライアル · いつでも解約可能",
    },
    business: {
      description: "共同で資金管理する小規模チーム向け。",
      features: [
        "Proの全機能",
        "無制限ワークスペースメンバー",
        "AIトークン1,500,000/月を含む",
        "監査ログと統制",
        "優先サポート",
        "APIと連携",
      ],
      cta: "営業に相談",
      note: "カスタム導入サポートあり",
    },
    monthly: "/月",
    annual:
      "インドネシア向けにIDRで表示。チェックアウトはIDR/USD/EURのローカライズ価格に対応。税金が適用される場合があります。",
    comingSoon: "近日公開",
    mostPopular: "人気プラン",
  },
};

export function PricingSection({ appUrl, locale }: { appUrl: string; locale: string; dictionary: WebsiteDictionary }) {
  const copy = PRICING_COPY[locale as keyof typeof PRICING_COPY] ?? PRICING_COPY.en;

  const plans = [
    {
      name: "Starter",
      price: "Rp0",
      ...copy.starter,
      highlighted: false,
      disabled: false,
    },
    {
      name: "Personal",
      price: "Rp39.9k",
      ...copy.personal,
      highlighted: true,
      disabled: false,
    },
    {
      name: "Pro",
      price: "Rp99.9k",
      ...copy.pro,
      highlighted: false,
      disabled: false,
    },
    {
      name: "Business",
      price: "Rp249.9k",
      ...copy.business,
      highlighted: false,
      disabled: false,
    },
  ];

  return (
    <section className="bg-background py-14 sm:py-18 lg:py-24">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center sm:mb-14">
          <h1 className="font-serif text-3xl text-foreground tracking-tight sm:text-5xl">
            Affordable pricing for daily tracking
          </h1>
          <p className="text-base text-muted-foreground leading-normal">Start free, upgrade when you need more room.</p>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex h-full flex-col rounded-none border p-6 sm:p-7 ${
                plan.highlighted ? "border-foreground bg-muted/35" : "border-border/70 bg-background"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-4 inline-flex self-start rounded-none border border-foreground px-3 py-1 text-xs">
                  {copy.mostPopular}
                </span>
              )}

              <h2 className="font-medium text-foreground text-lg">{plan.name}</h2>
              <p className="mt-1 mb-5 text-muted-foreground text-sm">{plan.description}</p>

              <div className="mb-6 flex items-baseline gap-2">
                <span className="font-serif text-4xl text-foreground">{plan.price}</span>
                {plan.price !== "$0" && <span className="text-muted-foreground text-sm">{copy.monthly}</span>}
              </div>

              <div className="flex-1 space-y-2.5 border-border/70 border-t pt-5 pb-6">
                {plan.features.map((feat) => (
                  <div key={feat} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-foreground">•</span>
                    <span className="text-foreground text-sm">{feat}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Button
                  asChild={!plan.disabled}
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  disabled={plan.disabled}
                >
                  {plan.disabled ? <span>{copy.comingSoon}</span> : <Link href={`${appUrl}/register`}>{plan.cta}</Link>}
                </Button>
                <p className="text-center text-muted-foreground text-xs">{plan.note}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-muted-foreground text-xs">{copy.annual}</p>
      </div>
    </section>
  );
}
