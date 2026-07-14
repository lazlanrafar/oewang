import { Icons } from "@workspace/ui/atoms";

// Wordmark where the O-diamond logo mark stands in for the capital "O" in
// "Oewang" — mark sized to the cap height and nudged onto the baseline so it
// reads as one serif word: ◇ewang. The mark inherits currentColor via
// text-foreground; the parent link supplies the accessible name.
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-serif text-foreground text-xl tracking-tight ${className}`}
    >
      <Icons.LogoSmall
        aria-hidden
        className="inline-block size-[0.94em] align-[-0.14em]"
      />
      <span aria-hidden>ewang</span>
    </span>
  );
}
