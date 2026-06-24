"use client";

import Image from "next/image";
import { scrollToId } from "@/lib/scroll";
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
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-gold">
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
            <button
              type="button"
              onClick={() => scrollToId("how-it-works")}
              className="text-sm text-gold underline-offset-4 transition-colors hover:text-cream hover:underline"
            >
              It&apos;s free. It&apos;s easy. It pays.
            </button>
          </div>
        </div>

        <div className="relative animate-fade-up animation-delay-200">
          <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-gold/30 shadow-2xl">
            <Image
              src={hostAsset("/images/hero-fridge.jpg")}
              alt="Dolce Sicilia smart fridge in an upscale building lobby, stocked with premium Sicilian tiramisù"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}
