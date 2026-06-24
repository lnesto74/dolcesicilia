import { GoldDivider } from "./GoldDivider";
import { ScrollReveal } from "./ScrollReveal";

const products = [
  {
    name: "Classic Mono",
    description: "Our signature mascarpone and espresso layers — the original, perfected.",
    priceFrom: "S$14.90",
  },
  {
    name: "Pistachio & Orange",
    description: "Bronte pistachio and candied Sicilian orange — a taste of Mount Etna.",
    priceFrom: "S$14.90",
  },
  {
    name: "Sharing Portions",
    description: "Elegant jars for two — perfect for lobby lounges and break rooms.",
    priceFrom: "S$14.90",
  },
  {
    name: "Big Sharing Trays",
    description: "Party-size trays for offices and events — our highest-value sellers.",
    priceFrom: "S$14.90",
  },
];

export function ProductRange() {
  return (
    <section id="products" className="bg-cream py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="text-center text-xs uppercase tracking-[0.25em] text-gold">What we stock</p>
          <h2 className="mt-3 text-center font-serif text-3xl text-navy sm:text-4xl">
            The range that drives your earnings
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />
        </ScrollReveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ScrollReveal key={product.name}>
              <article className="flex h-full flex-col rounded-sm border border-gold/20 bg-white p-6 transition-all hover:border-gold hover:shadow-md">
                {/* TODO: Replace with real product photography */}
                <div
                  className="mb-4 aspect-square rounded-sm bg-gradient-to-br from-navy/10 to-gold/20"
                  aria-hidden="true"
                />
                <h3 className="font-serif text-lg text-navy">{product.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-charcoal/75">
                  {product.description}
                </p>
                <p className="mt-4 text-sm font-medium text-gold">from {product.priceFrom}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
