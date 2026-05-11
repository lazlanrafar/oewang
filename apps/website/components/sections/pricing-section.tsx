"use client";

import { Button } from "@workspace/ui/atoms";
import Link from "next/link";
import type { WebsiteDictionary } from "@/lib/translations";

const PRICING_COPY = {
  en: {
    starter: {
      description: "For personal finance tracking and solo workflows.",
      features: [
        "Transaction tracking and categorization",
        "Up to 3 wallets",
        "Weekly spending insights",
        "1 workspace member",
      ],
      cta: "Get started free",
      note: "No credit card required",
    },
    pro: {
      description: "For founders and small teams that need collaboration.",
      features: [
        "Everything in Starter",
        "Unlimited wallets",
        "Advanced insights and reports",
        "Up to 5 workspace members",
        "Role-based access",
      ],
      cta: "Start free trial",
      note: "14-day trial · Cancel anytime",
    },
    business: {
      description: "For growing companies running finance with multiple teams.",
      features: [
        "Everything in Pro",
        "Unlimited workspace members",
        "Audit log and controls",
        "Priority support",
        "API and integrations",
      ],
      cta: "Contact sales",
      note: "Custom onboarding available",
    },
    monthly: "/month",
    annual: "All prices in USD. Taxes may apply.",
    comingSoon: "Coming soon",
    mostPopular: "Most popular",
  },
  id: {
    starter: {
      description: "Untuk pelacakan keuangan pribadi dan alur kerja solo.",
      features: [
        "Pelacakan dan kategorisasi transaksi",
        "Hingga 3 wallet",
        "Insight pengeluaran mingguan",
        "1 anggota workspace",
      ],
      cta: "Mulai gratis",
      note: "Tanpa kartu kredit",
    },
    pro: {
      description: "Untuk founder dan tim kecil yang butuh kolaborasi.",
      features: [
        "Semua fitur Starter",
        "Wallet tanpa batas",
        "Insight dan laporan lanjutan",
        "Hingga 5 anggota workspace",
        "Akses berbasis peran",
      ],
      cta: "Mulai uji coba gratis",
      note: "Uji coba 14 hari · Bisa batal kapan saja",
    },
    business: {
      description: "Untuk perusahaan berkembang dengan tim multi-user.",
      features: [
        "Semua fitur Pro",
        "Anggota workspace tanpa batas",
        "Audit log dan kontrol",
        "Dukungan prioritas",
        "API dan integrasi",
      ],
      cta: "Hubungi sales",
      note: "Onboarding khusus tersedia",
    },
    monthly: "/bulan",
    annual: "Semua harga dalam USD. Pajak dapat berlaku.",
    comingSoon: "Segera hadir",
    mostPopular: "Paling populer",
  },
  ja: {
    starter: {
      description: "個人の資金管理とソロ運用向け。",
      features: [
        "取引の追跡と自動分類",
        "最大3ウォレット",
        "週間支出インサイト",
        "1ワークスペースメンバー",
      ],
      cta: "無料で始める",
      note: "クレジットカード不要",
    },
    pro: {
      description: "共同作業が必要な創業者・小規模チーム向け。",
      features: [
        "Starterの全機能",
        "無制限ウォレット",
        "高度な分析とレポート",
        "最大5ワークスペースメンバー",
        "ロールベース権限",
      ],
      cta: "無料トライアルを開始",
      note: "14日間トライアル · いつでも解約可能",
    },
    business: {
      description: "複数チームで財務管理する成長企業向け。",
      features: [
        "Proの全機能",
        "無制限ワークスペースメンバー",
        "監査ログと統制",
        "優先サポート",
        "APIと連携",
      ],
      cta: "営業に相談",
      note: "カスタム導入サポートあり",
    },
    monthly: "/月",
    annual: "価格はすべてUSDです。税金が適用される場合があります。",
    comingSoon: "近日公開",
    mostPopular: "人気プラン",
  },
};

export function PricingSection({
  appUrl,
  locale,
  dictionary,
}: {
  appUrl: string;
  locale: string;
  dictionary: WebsiteDictionary;
}) {
  const copy = PRICING_COPY[locale as keyof typeof PRICING_COPY] ?? PRICING_COPY.en;

  const plans = [
    {
      name: "Starter",
      price: "$0",
      ...copy.starter,
      highlighted: false,
      disabled: false,
    },
    {
      name: "Pro",
      price: "$19",
      ...copy.pro,
      highlighted: true,
      disabled: false,
    },
    {
      name: "Business",
      price: "$49",
      ...copy.business,
      highlighted: false,
      disabled: true,
    },
  ];

  return (
    <section className="bg-background py-14 sm:py-18 lg:py-24">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-10 sm:mb-14 max-w-3xl mx-auto">
          <h1 className="font-serif text-3xl sm:text-5xl tracking-tight text-foreground">
            {dictionary.pricing.title}
          </h1>
          <p className="text-base text-muted-foreground leading-normal">
            {dictionary.pricing.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`h-full rounded-none border p-6 sm:p-7 flex flex-col ${
                plan.highlighted
                  ? "border-foreground bg-muted/35"
                  : "border-border/70 bg-background"
              }`}
            >
              {plan.highlighted && (
                <span className="inline-flex self-start mb-4 rounded-none border border-foreground px-3 py-1 text-xs">
                  {copy.mostPopular}
                </span>
              )}

              <h2 className="text-lg font-medium text-foreground">{plan.name}</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">{plan.description}</p>

              <div className="flex items-baseline gap-2 mb-6">
                <span className="font-serif text-4xl text-foreground">{plan.price}</span>
                {plan.price !== "$0" && (
                  <span className="text-sm text-muted-foreground">{copy.monthly}</span>
                )}
              </div>

              <div className="space-y-2.5 border-t border-border/70 pt-5 pb-6 flex-1">
                {plan.features.map((feat) => (
                  <div key={feat} className="flex items-start gap-2.5">
                    <span className="text-foreground mt-0.5">•</span>
                    <span className="text-sm text-foreground">{feat}</span>
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
                  {plan.disabled ? (
                    <span>{copy.comingSoon}</span>
                  ) : (
                    <Link href={`${appUrl}/register`}>{plan.cta}</Link>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">{plan.note}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center mt-10 text-xs text-muted-foreground">{copy.annual}</p>
      </div>
    </section>
  );
}
