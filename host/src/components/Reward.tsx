import { ScrollReveal } from "./ScrollReveal";
import { GoldDivider } from "./GoldDivider";

export function Reward() {
  return (
    <section id="reward" className="relative overflow-hidden bg-navy py-16 sm:py-24">
      <div
        className="pointer-events-none absolute right-0 top-0 h-64 w-64 opacity-10"
        aria-hidden="true"
      >
        {/* Sicilian line-art accent — Mount Etna silhouette */}
        <svg viewBox="0 0 200 200" fill="none" className="h-full w-full text-gold">
          <path
            d="M20 180 L60 80 L90 120 L120 40 L160 180 Z"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path d="M0 180 H200" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">The reward</p>
          <h2 className="mt-3 font-serif text-3xl text-cream sm:text-4xl">
            Our top hosts earn a week in Sicily.
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />
          <p className="mt-8 text-lg leading-relaxed text-cream/80">
            Top-performing and referring hosts win an all-expenses week in Sicily — home of
            tiramisù. Taste the origin story, meet our atelier, and return with stories your
            building will remember.
          </p>
          {/* TODO: Replace with elegant Sicily imagery */}
          <div
            className="mx-auto mt-10 aspect-[21/9] max-w-2xl rounded-sm border border-gold/30 bg-gradient-to-r from-navy-light via-gold/10 to-navy-light"
            role="img"
            aria-label="Sicilian landscape accent — placeholder for aspirational photography"
          />
        </ScrollReveal>
      </div>
    </section>
  );
}
