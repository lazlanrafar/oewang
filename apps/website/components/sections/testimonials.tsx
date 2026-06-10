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
      "I switched from a spreadsheet to Oewang in one afternoon. Now I can see my daily spending clearly without rebuilding my sheet every week.",
    name: "Priya Kapoor",
    role: "Freelance Designer",
    initials: "PK",
  },
  {
    quote:
      "The real-time insights have completely changed how I make spending decisions. I used to wait until month-end for numbers — now I check them daily.",
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
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-serif text-3xl text-foreground tracking-tight sm:text-4xl">
            Trusted by daily money trackers
          </h2>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground">
            See what people say after replacing spreadsheets with Oewang.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="flex flex-col gap-4 border border-border bg-background p-6 transition-colors hover:border-foreground/20"
            >
              <p className="flex-1 text-muted-foreground text-sm leading-6">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 border-border border-t pt-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-xs">
                  {t.initials}
                </div>
                <div>
                  <p className="text-foreground text-sm">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
