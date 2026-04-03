import { useEffect, useRef } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { pricingConfig } from '../config';

export function Pricing() {
  if (!pricingConfig.mainTitle) return null;

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    );

    const elements = sectionRef.current?.querySelectorAll('.fade-up, .scale-in');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const scrollToContact = () => {
    const element = document.querySelector('#contact');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="pricing"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-white"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #004F9F 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="container-custom relative">
        {/* Section Header */}
        <div className="fade-up text-center mb-16">
          <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">
            {pricingConfig.scriptText}
          </span>
          <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
            {pricingConfig.subtitle}
          </span>
          <h2 className="font-serif text-h1 text-ink-800">
            {pricingConfig.mainTitle}
          </h2>
          {/* Decorative separator */}
          <div className="separator-ornament mt-6">
            <span className="text-mediterranean-400">◆</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {pricingConfig.packages.map((pkg, index) => (
            <div
              key={pkg.id}
              className={`scale-in bg-cream-500 border-2 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${
                pkg.featured
                  ? 'border-mediterranean-700 relative'
                  : 'border-beige-700'
              }`}
              style={{ 
                transitionDelay: `${0.1 + index * 0.1}s`,
                borderRadius: '0.25rem'
              }}
            >
              {/* Featured Badge */}
              {pkg.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-mediterranean-700 text-white px-6 py-1.5 text-xs uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              {/* Image */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={pkg.image}
                  alt={`${pkg.name} - ${pkg.description}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                
                {/* Price Overlay */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-white/95 backdrop-blur-sm p-4 text-center">
                    <div className="font-serif text-4xl text-mediterranean-700 mb-1">
                      ${pkg.price}
                    </div>
                    <div className="text-xs text-ink-600 uppercase tracking-wider">
                      {pkg.priceLabel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 lg:p-8">
                <h3 className="font-serif text-2xl text-ink-800 mb-2 text-center">
                  {pkg.name}
                </h3>
                <p className="text-mediterranean-700 text-sm text-center mb-4">
                  {pkg.size}
                </p>
                <p className="text-ink-600 text-sm leading-relaxed mb-6 text-center">
                  {pkg.description}
                </p>

                {/* Features */}
                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-3 mb-6">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                        <Check className="w-4 h-4 text-mediterranean-700 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Order Button */}
                <button
                  onClick={scrollToContact}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-6 text-sm font-medium transition-all duration-300 ${
                    pkg.featured
                      ? 'btn-primary'
                      : 'border border-beige-700 text-ink-700 hover:bg-mediterranean-700 hover:text-white hover:border-mediterranean-700'
                  }`}
                  style={{ borderRadius: '0.125rem' }}
                  aria-label={`Order ${pkg.name}`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Order Now
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        {pricingConfig.additionalInfo && (
          <div className="fade-up mt-12 text-center max-w-2xl mx-auto" style={{ transitionDelay: '0.4s' }}>
            <p className="text-ink-600 text-sm leading-relaxed">
              {pricingConfig.additionalInfo}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
