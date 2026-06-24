import Image from "next/image";
import { GoldDivider } from "./GoldDivider";
import { ScrollReveal } from "./ScrollReveal";
import { hostAsset } from "@/lib/assets";

const steps = [
  {
    number: "1",
    title: "You give",
    description:
      "A power point, ~1 m² of floor space, and access for restocking 2–3× per week.",
  },
  {
    number: "2",
    title: "We deliver",
    description: "A branded tap-to-open smart fridge, stocked fresh daily.",
  },
  {
    number: "3",
    title: "You earn",
    description: "20% of every sale, paid monthly.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="text-center text-xs uppercase tracking-[0.25em] text-gold">How it works</p>
          <h2 className="mt-3 text-center font-serif text-3xl text-navy sm:text-4xl">
            Three simple steps
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />
        </ScrollReveal>

        <ScrollReveal className="mt-10">
          <div className="relative mx-auto aspect-[21/9] max-w-4xl overflow-hidden rounded-sm border border-gold/20 shadow-lg">
            <Image
              src={hostAsset("/images/how-it-works.jpg")}
              alt="Dolce Sicilia smart fridge — tap to browse, choose your tiramisù, retrieve and enjoy"
              fill
              sizes="(max-width: 1024px) 100vw, 896px"
              className="object-cover object-top"
              loading="lazy"
            />
          </div>
        </ScrollReveal>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <ScrollReveal key={step.number}>
              <article className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold font-serif text-2xl text-gold">
                  {step.number}
                </div>
                <h3 className="mt-5 font-serif text-xl text-navy">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-charcoal/75">{step.description}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
