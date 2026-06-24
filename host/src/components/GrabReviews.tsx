import { GoldDivider } from "./GoldDivider";
import { ScrollReveal } from "./ScrollReveal";
import { StarRating } from "./StarRating";
import { GrabLogo } from "./GrabLogo";

const reviews = [
  {
    name: "Vera",
    text: "Wow, I think this is the best tiramisu I have ever had!! Mascarpone is melting in the mouth. Just so well balanced! Love it.",
    item: "Classic Tiramisù",
  },
  {
    name: "Vero",
    text: "A refined, beautifully-composed tiramisu on par with some of the most exceptional ones I've tasted in Italy. Would gladly recommend.",
    item: "Classic Tiramisù mono portion",
  },
  {
    name: "Mita",
    text: "This is my third time ordering the classic tiramisu, and I must say, it never disappoints. Truly exceptional — among the best I've ever had.",
    item: "Classic Tiramisù mono portion",
  },
  {
    name: "Shuen T.",
    text: "Love this! Third time ordering. Yummy dessert!",
    item: "Classic Italian Tiramisù",
  },
  {
    name: "Hazel G.",
    text: "First time ordering but will definitely come back for more! Very happy to find such tasty tiramisu in our neighbourhood.",
    item: "Classic & Orange Liquor Tiramisù",
  },
  {
    name: "Rebecca",
    text: "Ridiculously delicious. Love the strong taste of coffee and liqueur.",
    item: "Classic Tiramisù (Solo)",
  },
];

export function GrabReviews() {
  return (
    <section id="reviews" className="bg-white py-16 sm:py-24" aria-label="Grab customer reviews">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-3">
              <GrabLogo className="h-6" />
              <span className="text-sm text-charcoal/50">customer reviews</span>
            </div>
            <h2 className="font-serif text-3xl text-navy sm:text-4xl">Loved on Grab</h2>
            <div className="flex items-center gap-2">
              <StarRating />
              <span className="text-sm font-medium text-charcoal/70">5.0 · real orders</span>
            </div>
            <GoldDivider className="mt-2 max-w-xs" />
          </div>
        </ScrollReveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <ScrollReveal key={review.name + review.text.slice(0, 20)}>
              <article className="flex h-full flex-col rounded-sm border border-gold/20 bg-cream p-6 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-navy/10 font-medium text-navy">
                    {review.name.charAt(0)}
                  </div>
                  <StarRating />
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-charcoal/80">
                  &ldquo;{review.text}&rdquo;
                </p>
                <p className="mt-4 text-xs text-charcoal/50">
                  <span className="font-medium text-charcoal/70">{review.name}</span>
                  {" · "}
                  {review.item}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-charcoal/40">
                  via <GrabLogo className="h-3.5" />
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
