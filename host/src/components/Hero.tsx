"use client";

import { scrollToId } from "@/lib/scroll";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { ShowcaseImage } from "./ShowcaseImage";
import { hostAsset } from "@/lib/assets";

export function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-[100dvh] overflow-hidden bg-navy pt-24 text-cream"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath d='M60 10 L70 50 L60 90 L50 50 Z M20 60 L60 70 L100 60 L60 50 Z' fill='none' stroke='%23C8A15A' stroke-width='0.5'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div className="animate-fade-up">
          <p className="mb-3 inline-flex items-center gap-2 rounded-sm border border-gold/50 bg-gold/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-pistachio" aria-hidden="true" />
            Freshly made daily · Limited batch
          </p>
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-gold/80">
            Building partner programme
          </p>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl lg:text-[3.25rem]">
            Turn 1 m² of your lobby into passive income.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-cream/85">
            We install a premium Sicilian tiramisù fridge in your building at zero cost. You earn
            20% of every sale.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => scrollToId("calculator")}
              className="rounded-sm bg-pistachio px-6 py-3.5 text-base font-medium text-white transition-all hover:bg-pistachio-dark hover:shadow-lg"
            >
              See how much you could earn
            </button>
            <a
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm text-gold underline-offset-4 transition-colors hover:text-cream hover:underline sm:text-left"
            >
              It&apos;s free. It&apos;s easy. It pays.
            </a>
          </div>
        </div>

        <div className="animate-fade-up animation-delay-200">
          <ShowcaseImage
            src={hostAsset("/images/hero-fridge.jpg")}
            alt="Dolce Sicilia host partner programme — smart fridge in a building lobby"
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
