const TESTIMONIALS = [
  {
    quote:
      "Oewang replaced three different tools for us. Every transaction, wallet, and invoice is in one place. Our accountant loves it.",
    name: "Aria Chen",
    role: "Founder, Flowcraft Studio",
    initials: "AC",
  },
  {
    quote:
      "The multi-currency support is incredible. We invoice clients in 5 countries and everything reconciles without any manual work.",
    name: "Mateus Lima",
    role: "CEO, Atlas Consulting",
    initials: "ML",
  },
  {
    quote:
      "I switched from a spreadsheet to Oewang in one afternoon. The import was seamless and now I can actually see what's happening in my business.",
    name: "Priya Kapoor",
    role: "Freelance Designer",
    initials: "PK",
  },
  {
    quote:
      "The real-time insights have completely changed how I make decisions. I used to wait until month-end for numbers — now I check them daily.",
    name: "James O'Brien",
    role: "Co-founder, NorthStack",
    initials: "JO",
  },
  {
    quote:
      "Security was our number one concern. Knowing all data is AES-256 encrypted end-to-end was the deciding factor for us.",
    name: "Soo-Jin Park",
    role: "CFO, Meridian Tech",
    initials: "SP",
  },
  {
    quote:
      "The speed is unreal. No lag, no spinners. Just instant responses. It feels like using a native desktop app.",
    name: "Lucas Ferreira",
    role: "Product Manager, DevLoop",
    initials: "LF",
  },
];

export function TestimonialsSection() {
  return (
    <section className="bg-background py-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground mb-4">
            Trusted by modern teams
          </h2>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            See what founders and finance leads are saying about Oewang.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="border border-border p-6 flex flex-col gap-4 bg-background hover:border-foreground/20 transition-colors"
            >
              <p className="text-sm text-muted-foreground leading-6 flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
