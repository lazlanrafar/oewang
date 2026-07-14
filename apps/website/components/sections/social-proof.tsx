import type { WebsiteDictionary } from "@/lib/translations";
import { Container } from "./_shared";

// Server component — pure CSS marquee, no JS. Renders the channel list twice so
// the -50% translate loops seamlessly.
export function SocialProof({ dictionary }: { dictionary: WebsiteDictionary }) {
  const channels = dictionary.socialProof.channels;
  const loop = [...channels, ...channels];

  return (
    <section className="border-border/60 border-y bg-[hsl(var(--card))]/40 py-10">
      <Container className="mb-6">
        <p className="text-center text-muted-foreground text-sm">
          {dictionary.socialProof.heading}
        </p>
      </Container>

      {/* Edge fade masks so items dissolve at the container edges. */}
      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <div className="marquee-track flex w-max items-center gap-14 pr-14">
          {loop.map((channel, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static duplicated marquee list
              key={`${channel}-${i}`}
              className="whitespace-nowrap font-serif text-foreground/70 text-xl tracking-tight"
            >
              {channel}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
