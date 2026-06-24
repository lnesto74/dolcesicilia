import Image from "next/image";
import { GoldDivider } from "./GoldDivider";
import { ScrollReveal } from "./ScrollReveal";
import { hostAsset } from "@/lib/assets";

const products = [
  {
    name: "Classic Mono",
    description: "Our signature mascarpone and espresso layers — the original, perfected.",
    priceFrom: "S$14.90",
    image: hostAsset("/images/products/classic-mono.jpg"),
    alt: "Dolce Sicilia classic tiramisù individual portion",
  },
  {
    name: "Pistachio & Orange",
    description: "Bronte pistachio and candied Sicilian orange — a taste of Mount Etna.",
    priceFrom: "S$14.90",
    image: hostAsset("/images/products/pistachio-orange.jpg"),
    alt: "Dolce Sicilia orange tiramisù with candied Sicilian orange",
  },
  {
    name: "Sharing Portions",
    description: "Elegant jars for two — perfect for lobby lounges and break rooms.",
    priceFrom: "S$14.90",
    image: hostAsset("/images/products/sharing-portions.jpg"),
    alt: "Dolce Sicilia tasting box with three signature flavours",
  },
  {
    name: "Big Sharing Trays",
    description: "Party-size trays for offices and events — our highest-value sellers.",
    priceFrom: "S$14.90",
    image: hostAsset("/images/products/sharing-trays.jpg"),
    alt: "Dolce Sicilia classic tiramisù sharing portion",
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
              <article className="flex h-full flex-col overflow-hidden rounded-sm border border-gold/20 bg-white transition-all hover:border-gold hover:shadow-md">
                <div className="relative aspect-square">
                  <Image
                    src={product.image}
                    alt={product.alt}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-serif text-lg text-navy">{product.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-charcoal/75">
                    {product.description}
                  </p>
                  <p className="mt-4 text-sm font-medium text-gold">from {product.priceFrom}</p>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
