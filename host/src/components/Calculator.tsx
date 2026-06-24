"use client";

import { useState } from "react";
import {
  BLENDED_BASKET,
  CALCULATOR_DEFAULT_ITEMS,
  CALCULATOR_MAX_ITEMS,
  CALCULATOR_MIN_ITEMS,
  HOST_SHARE,
  calculateHostEarnings,
} from "@/lib/constants";
import { formatSgd } from "@/lib/format";
import { scrollToId } from "@/lib/scroll";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { GoldDivider } from "./GoldDivider";
import { ScrollReveal } from "./ScrollReveal";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function trackCalculatorCta() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("trackCustom", "InitiateCheckout", { content_name: "Host Calculator CTA" });
  }
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "begin_checkout", { event_category: "host", event_label: "calculator_cta" });
  }
}

export function Calculator() {
  const [itemsPerDay, setItemsPerDay] = useState(CALCULATOR_DEFAULT_ITEMS);
  const { monthly, yearly } = calculateHostEarnings(itemsPerDay);
  const animatedMonthly = useAnimatedNumber(monthly);
  const animatedYearly = useAnimatedNumber(yearly);

  const handleReserve = () => {
    trackCalculatorCta();
    scrollToId("lead-form");
  };

  return (
    <section id="calculator" className="bg-navy py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <ScrollReveal>
          <div className="rounded-sm border border-gold/40 bg-navy-light p-6 shadow-2xl sm:p-10">
            <p className="text-center text-xs uppercase tracking-[0.25em] text-gold">
              Earnings calculator
            </p>
            <h2 className="mt-3 text-center font-serif text-2xl text-cream sm:text-3xl">
              Earn up to S$27,000+ per year, per fridge.
            </h2>
            <GoldDivider className="mx-auto mt-6 max-w-xs" />

            <div className="mt-10">
              <label htmlFor="items-slider" className="block text-sm text-cream/80">
                Estimated desserts sold per day:{" "}
                <span className="font-medium text-gold">{itemsPerDay}</span>
              </label>
              <input
                id="items-slider"
                type="range"
                min={CALCULATOR_MIN_ITEMS}
                max={CALCULATOR_MAX_ITEMS}
                value={itemsPerDay}
                onChange={(e) => setItemsPerDay(Number(e.target.value))}
                className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-navy accent-gold"
                aria-valuemin={CALCULATOR_MIN_ITEMS}
                aria-valuemax={CALCULATOR_MAX_ITEMS}
                aria-valuenow={itemsPerDay}
              />
              <div className="mt-1 flex justify-between text-xs text-cream/50">
                <span>{CALCULATOR_MIN_ITEMS}/day</span>
                <span>{CALCULATOR_MAX_ITEMS}/day</span>
              </div>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              <div className="rounded-sm border border-gold/30 bg-navy p-6 text-center">
                <p className="text-sm text-cream/70">Monthly income</p>
                <p className="mt-2 font-serif text-3xl text-gold sm:text-4xl" aria-live="polite">
                  {formatSgd(animatedMonthly)}
                </p>
              </div>
              <div className="rounded-sm border border-gold/30 bg-navy p-6 text-center">
                <p className="text-sm text-cream/70">Yearly income</p>
                <p className="mt-2 font-serif text-3xl text-gold sm:text-4xl" aria-live="polite">
                  {formatSgd(animatedYearly)}
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-sm leading-relaxed text-cream/60">
              From S$13,000+/year at quieter sites to S$27,000+/year at prime locations. Actual
              results vary by location.
            </p>

            <p className="mt-4 text-center text-xs text-cream/40">
              Based on S${BLENDED_BASKET.toFixed(2)} blended basket × {(HOST_SHARE * 100).toFixed(0)}%
              host share
            </p>

            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={handleReserve}
                className="w-full rounded-sm bg-pistachio px-6 py-3.5 text-base font-medium text-white transition-all hover:bg-pistachio-dark hover:shadow-lg sm:w-auto"
              >
                Reserve a fridge for my building
              </button>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
