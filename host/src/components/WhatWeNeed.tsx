import { ScrollReveal } from "./ScrollReveal";
import { GoldDivider } from "./GoldDivider";

const requirements = [
  "Power point (standard 13A socket)",
  "~1 m² space",
  "Access for restocking",
];

export function WhatWeNeed() {
  return (
    <section id="requirements" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">What we need</p>
          <h2 className="mt-3 font-serif text-3xl text-navy sm:text-4xl">Minimal from you</h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />

          <ul className="mt-10 space-y-4">
            {requirements.map((item) => (
              <li
                key={item}
                className="flex items-center justify-center gap-3 text-lg text-charcoal"
              >
                <span className="text-gold" aria-hidden="true">
                  ◆
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-10 font-serif text-xl text-navy">
            No cost. No lock-in. Cancel anytime.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
