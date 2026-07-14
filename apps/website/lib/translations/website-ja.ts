import type { WebsiteDictionary } from "./website-en";

// Full Japanese translation of the marketing site. Shape mirrors websiteEn
// (enforced by the WebsiteDictionary annotation). Brand/product names
// (Oewang, AI, Telegram, WhatsApp, CSV) are kept as-is.
export const websiteJa: WebsiteDictionary = {
  nav: {
    overview: "概要",
    features: "機能",
    pricing: "料金",
    faq: "よくある質問",
    signIn: "ログイン",
    signOut: "ログアウト",
  },
  hero: {
    badge: "AI家計ワークスペース",
    titleLead: "お金を、",
    titleAccent: "かんたんに。",
    titleAccents: ["かんたんに。", "すぐに。", "自動で。", "美しく。", "みんなで。"],
    subtitle:
      "Oewangはすべての取引を記録します——レシートを撮影、チャットを転送、またはAIに聞くだけ——日々の支出を、個人とチームのワークスペース全体で明確にします。",
    ctaStartFree: "無料で始める",
    ctaSeeHow: "使い方を見る",
    ctaGoToDashboard: "ダッシュボードへ",
    trialNote: "無料プランあり · クレジットカード不要",
  },
  chatDemo: {
    appName: "Oewang AI",
    status: "オンライン",
    receiptLabel: "receipt.jpg",
    lockTime: "9:41",
    lockDate: "6月9日 月曜日",
  },
  socialProof: {
    heading: "いつもの場所から支出を記録",
    channels: ["レシート写真", "Telegram", "WhatsApp", "メール転送", "CSVインポート", "多通貨対応"],
  },
  pillars: {
    label: "Oewangの理由",
    title: "お金の実際の動きに合わせて設計。",
    items: [
      {
        title: "数秒で記録",
        description: "レシートを転送するか一行入力するだけ。Oewangが読み取り、分類し、自動で保存します。",
      },
      {
        title: "表計算ではなく、明確さ",
        description: "すべての収入と支出を統合し、検索でき、自動分類——手作業の列は不要です。",
      },
      {
        title: "AIに何でも質問",
        description: "「今月は食費にいくら使った？」レポートを掘らずに本当の答えが得られます。",
      },
      {
        title: "個人もチームも",
        description: "個人・家族・チームのワークスペースを、記録を混ぜることなく切り替えられます。",
      },
    ],
  },
  showcase: {
    label: "使い方",
    title: "レシートから意思決定まで——ひとつの流れで。",
    subtitle: "1件の取引が、表計算に触れずに記録から洞察へと進む様子をご覧ください。",
    steps: [
      {
        title: "記録",
        caption: "レシートを撮影または転送。AIが店名・金額・カテゴリを即座に読み取ります。",
      },
      {
        title: "整理",
        caption: "取引一覧に追加——分類され、検索でき、多通貨にも対応。",
      },
      {
        title: "把握",
        caption: "何が変わり、何が期限で、お金が実際どこへ行くのかをアシスタントに尋ねましょう。",
      },
    ],
  },
  features: {
    label: "機能",
    title: "日々のお金を明確に保つすべて。",
    chapters: [
      {
        label: "明確さ",
        title: "すべての取引を、ひとつに。",
        description: "すべての収入と支出を記録・検索・分類し、日々のお金を明確に保ちます。",
        points: ["AIによる自動分類", "即座に検索・絞り込み", "多通貨対応", "取引の一括編集"],
      },
      {
        label: "AI",
        title: "お金について何でも質問。",
        description: "支出・収益・傾向への即答——もうレポートを掘る必要はありません。",
        points: ["自然言語での質問", "リアルタイムの洞察", "週次サマリー", "マルチエージェントAI"],
      },
      {
        label: "ワークスペース",
        title: "ひとつのアカウント、多くの世界。",
        description: "個人・家族・チームのワークスペースを、記録を混ぜずに切り替え。",
        points: [
          "役割ベースのメンバー権限",
          "ワークスペースごとに分離された記録",
          "共有ダッシュボード",
          "アカウントごとに複数のワークスペース",
        ],
      },
    ],
  },
  stats: {
    label: "数字で見る",
    title: "手間は少なく。明確さは多く。",
    items: [
      { value: "2秒", label: "レシートから取引を記録" },
      { value: "40+", label: "連携と記録チャネル" },
      { value: "6", label: "標準対応の通貨数" },
      { value: "100%", label: "あなたの記録をひとつのワークスペースに" },
    ],
  },
  pricing: {
    label: "料金",
    title: "無料で開始。成長に合わせてアップグレード。",
    subtitle: "すべてのプランにAI記録、統合取引、Vaultストレージが含まれます。",
    note: "USD表示 · 月額または年額請求",
    ctaGet: "始める",
    ctaComingSoon: "順番待ちに登録",
  },
  faq: {
    label: "よくある質問",
    title: "疑問に、お答えします。",
    items: [
      {
        q: "Oewangはどうやって取引を記録しますか？",
        a: "レシートを撮影、TelegramやWhatsAppで転送、CSVをインポート、または一行入力するだけ。OewangのAIが店名・金額・カテゴリを読み取り、自動で保存します。",
      },
      {
        q: "私の財務データは安全ですか？",
        a: "はい。記録はワークスペースごとに分離され、通信時も保存時も暗号化され、個人とチームのワークスペース間で共有されることはありません。",
      },
      {
        q: "個人とビジネスの両方に使えますか？",
        a: "まさにそのためのものです。ひとつのアカウントに複数のワークスペース——個人・家族・チーム——があり、それぞれ独自の記録と役割ベースのアクセスを持ちます。",
      },
      {
        q: "対応している通貨は？",
        a: "6通貨が標準対応で、多通貨を自動処理するため、混在した支出も明確なままです。",
      },
      {
        q: "始めるのにクレジットカードは必要ですか？",
        a: "いいえ。無料のStarterプランで始め、必要になったときだけアップグレードできます——開始にカードは不要です。",
      },
    ],
  },
  cta: {
    title: "お金を、はっきり見てみませんか？",
    subtitle: "取引を記録し、支出を把握し、あらゆる請求に先回り——今日から始めましょう。",
    getStarted: "無料で始める",
    viewPricing: "料金を見る",
    trialNote: "無料プランあり · クレジットカード不要",
  },
  articles: {
    label: "記事",
    heading: "Oewangチームから。",
    empty: "まだ記事がありません。近日公開予定です。",
    all: "すべての記事",
    metaTitle: "記事 — Oewang",
    metaDescription: "お金やレシートの管理、AIを活用した家計について、Oewangチームによるガイドと最新情報。",
  },
  footer: {
    tagline: "実生活のためのお金の明確さ。",
    rights: "無断転載を禁じます。",
    product: "プロダクト",
    company: "会社",
    articles: "記事",
    terms: "利用規約",
    privacy: "プライバシー",
  },
  notFound: {
    title: "404",
    heading: "ページが見つかりません",
    description: "お探しのページは存在しないか、移動された可能性があります。",
    goHome: "ホームへ",
    goToApp: "アプリへ",
  },
};
