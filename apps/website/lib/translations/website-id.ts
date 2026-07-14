import type { WebsiteDictionary } from "./website-en";

// Full Indonesian translation of the marketing site. Shape mirrors websiteEn
// (enforced by the WebsiteDictionary annotation). Brand/product names
// (Oewang, AI, Telegram, WhatsApp, CSV) are kept as-is.
export const websiteId: WebsiteDictionary = {
  nav: {
    overview: "Ringkasan",
    features: "Fitur",
    pricing: "Harga",
    faq: "FAQ",
    signIn: "Masuk",
    signOut: "Keluar",
  },
  hero: {
    badge: "Ruang kerja keuangan AI",
    titleLead: "Pahami uang Anda,",
    titleAccent: "tanpa ribet.",
    titleAccents: ["tanpa ribet.", "seketika.", "otomatis.", "dengan indah.", "bersama-sama."],
    subtitle:
      "Oewang mencatat setiap transaksi — foto struk, teruskan chat, atau cukup tanya AI — dan mengubah pengeluaran harian menjadi kejelasan di seluruh ruang kerja pribadi maupun tim.",
    ctaStartFree: "Mulai gratis",
    ctaSeeHow: "Lihat cara kerjanya",
    ctaGoToDashboard: "Buka dasbor",
    trialNote: "Paket gratis tersedia · Tanpa kartu kredit",
  },
  chatDemo: {
    appName: "Oewang AI",
    status: "Online",
    receiptLabel: "struk.jpg",
    lockTime: "9:41",
    lockDate: "Senin, 9 Juni",
  },
  socialProof: {
    heading: "Catat pengeluaran dari mana pun Anda berada",
    channels: ["Foto struk", "Telegram", "WhatsApp", "Teruskan email", "Impor CSV", "Multi-mata uang"],
  },
  pillars: {
    label: "Kenapa Oewang",
    title: "Dirancang mengikuti cara uang benar-benar bergerak.",
    items: [
      {
        title: "Catat dalam hitungan detik",
        description: "Teruskan struk atau ketik satu baris. Oewang membaca, mengategorikan, dan menyimpannya otomatis.",
      },
      {
        title: "Kejelasan, bukan spreadsheet",
        description:
          "Setiap pemasukan dan pengeluaran menyatu, mudah dicari, dan terkategori otomatis — tanpa kolom manual.",
      },
      {
        title: "Tanyakan apa saja ke AI",
        description:
          "“Berapa pengeluaran saya untuk makan bulan ini?” Dapatkan jawaban nyata alih-alih menggali laporan.",
      },
      {
        title: "Pribadi dan tim",
        description: "Beralih antara ruang kerja pribadi, keluarga, dan tim tanpa pernah mencampur catatan.",
      },
    ],
  },
  showcase: {
    label: "Cara kerja",
    title: "Dari struk menjadi keputusan — dalam satu alur.",
    subtitle: "Lihat satu transaksi bergerak dari pencatatan ke wawasan tanpa menyentuh spreadsheet.",
    steps: [
      {
        title: "Catat",
        caption: "Foto atau teruskan struk. AI langsung membaca merchant, jumlah, dan kategori.",
      },
      {
        title: "Rapikan",
        caption: "Masuk ke daftar transaksi Anda — terkategori, mudah dicari, dan siap multi-mata uang.",
      },
      {
        title: "Pahami",
        caption: "Tanyakan ke asisten apa yang berubah, apa yang jatuh tempo, dan ke mana uang Anda benar-benar pergi.",
      },
    ],
  },
  features: {
    label: "Fitur",
    title: "Semua yang dibutuhkan agar uang harian tetap jelas.",
    chapters: [
      {
        label: "Kejelasan",
        title: "Semua transaksi Anda, menyatu.",
        description:
          "Setiap pemasukan dan pengeluaran dilacak, dicari, dan dikategorikan agar uang harian Anda tetap jelas.",
        points: [
          "Kategorisasi otomatis dengan AI",
          "Cari dan filter seketika",
          "Dukungan multi-mata uang",
          "Edit transaksi massal",
        ],
      },
      {
        label: "AI",
        title: "Tanyakan apa saja tentang keuangan Anda.",
        description: "Jawaban instan tentang pengeluaran, pendapatan, dan tren — tanpa lagi menggali laporan.",
        points: ["Kueri bahasa alami", "Wawasan real-time", "Ringkasan mingguan", "Sistem AI multi-agen"],
      },
      {
        label: "Ruang kerja",
        title: "Satu akun, banyak dunia.",
        description: "Beralih antara ruang kerja pribadi, keluarga, dan tim tanpa mencampur catatan.",
        points: [
          "Akses anggota berbasis peran",
          "Catatan terpisah per ruang kerja",
          "Dasbor bersama",
          "Banyak ruang kerja per akun",
        ],
      },
    ],
  },
  stats: {
    label: "Dalam angka",
    title: "Lebih sedikit administrasi. Lebih banyak kejelasan.",
    items: [
      { value: "2 dtk", label: "untuk mencatat transaksi dari struk" },
      { value: "40+", label: "integrasi dan saluran pencatatan" },
      { value: "6", label: "mata uang didukung langsung" },
      { value: "100%", label: "catatan Anda dalam satu ruang kerja" },
    ],
  },
  pricing: {
    label: "Harga",
    title: "Mulai gratis. Tingkatkan saat Anda tumbuh.",
    subtitle: "Setiap paket mencakup pencatatan AI, transaksi menyatu, dan penyimpanan vault.",
    note: "Harga dalam USD · Ditagih bulanan atau tahunan",
    ctaGet: "Mulai",
    ctaComingSoon: "Gabung daftar tunggu",
  },
  faq: {
    label: "FAQ",
    title: "Pertanyaan, terjawab.",
    items: [
      {
        q: "Bagaimana Oewang mencatat transaksi saya?",
        a: "Foto struk, teruskan lewat Telegram atau WhatsApp, impor CSV, atau ketik satu baris. AI Oewang membaca merchant, jumlah, dan kategori lalu menyimpannya otomatis.",
      },
      {
        q: "Apakah data keuangan saya aman?",
        a: "Ya. Catatan terisolasi per ruang kerja, dienkripsi saat transit maupun tersimpan, dan tidak pernah dibagikan antara ruang kerja pribadi dan tim Anda.",
      },
      {
        q: "Bisakah saya memakainya untuk keuangan pribadi dan bisnis?",
        a: "Justru itu tujuannya. Satu akun memuat banyak ruang kerja — pribadi, keluarga, dan tim — masing-masing dengan catatan sendiri dan akses berbasis peran.",
      },
      {
        q: "Mata uang apa saja yang didukung?",
        a: "Enam mata uang langsung tersedia dengan penanganan multi-mata uang otomatis, sehingga pengeluaran campuran tetap jelas.",
      },
      {
        q: "Apakah saya perlu kartu kredit untuk mulai?",
        a: "Tidak. Mulai dengan paket Starter gratis dan tingkatkan hanya saat Anda butuh lebih — tanpa kartu untuk memulai.",
      },
    ],
  },
  cta: {
    title: "Siap melihat uang Anda dengan jelas?",
    subtitle: "Catat transaksi, pahami pengeluaran, dan selalu selangkah di depan setiap tagihan — mulai hari ini.",
    getStarted: "Mulai gratis",
    viewPricing: "Lihat harga",
    trialNote: "Paket gratis tersedia · Tanpa kartu kredit",
  },
  articles: {
    label: "Artikel",
    heading: "Dari tim Oewang.",
    empty: "Belum ada artikel. Nantikan segera.",
    all: "Semua artikel",
    metaTitle: "Artikel — Oewang",
    metaDescription: "Panduan dan pembaruan tentang mencatat uang, struk, dan keuangan bertenaga AI dari tim Oewang.",
  },
  footer: {
    tagline: "Kejelasan keuangan untuk hidup nyata.",
    rights: "Seluruh hak cipta dilindungi.",
    product: "Produk",
    company: "Perusahaan",
    articles: "Artikel",
    terms: "Ketentuan",
    privacy: "Privasi",
  },
  notFound: {
    title: "404",
    heading: "Halaman tidak ditemukan",
    description: "Halaman yang Anda cari tidak ada atau telah dipindahkan.",
    goHome: "Ke beranda",
    goToApp: "Ke aplikasi",
  },
};
