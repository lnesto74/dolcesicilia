"use client";

import { useState } from "react";
import { ScrollReveal } from "./ScrollReveal";
import { GoldDivider } from "./GoldDivider";

const faqs = [
  {
    question: "What does it cost me?",
    answer: "Nothing. We supply, install, stock and maintain the fridge at our expense.",
  },
  {
    question: "Who restocks and maintains it?",
    answer: "We do. Our team handles daily stocking, cleaning and technical upkeep.",
  },
  {
    question: "What if it doesn't sell?",
    answer: "We relocate the machine at zero cost to you. There is no penalty or lock-in.",
  },
  {
    question: "How big is it?",
    answer: "Approximately 0.8–1 m² of floor space, powered by a standard 13A socket.",
  },
  {
    question: "How am I paid?",
    answer: "Monthly, via bank transfer — 20% of all sales from your location.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-cream py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="text-center text-xs uppercase tracking-[0.25em] text-gold">FAQ</p>
          <h2 className="mt-3 text-center font-serif text-3xl text-navy sm:text-4xl">
            Common questions
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />
        </ScrollReveal>

        <div className="mt-10 divide-y divide-gold/20 border border-gold/20 rounded-sm bg-white">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-navy transition-colors hover:text-gold"
                    aria-expanded={isOpen}
                  >
                    <span className="font-medium pr-4">{faq.question}</span>
                    <span className="text-gold text-xl flex-shrink-0" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="px-5 pb-4 text-sm leading-relaxed text-charcoal/75">{faq.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
