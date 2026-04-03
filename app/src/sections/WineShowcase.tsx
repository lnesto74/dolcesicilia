import { useState, useEffect, useRef } from 'react';
import { Wine, Sparkles, Thermometer, Clock, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { wineShowcaseConfig } from '../config';

// Icon lookup map for dynamic icon resolution from config strings
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wine, Sparkles, Thermometer, Clock,
};

export function WineShowcase() {
  // Null check: if config is empty, render nothing
  if (!wineShowcaseConfig.mainTitle || wineShowcaseConfig.wines.length === 0) return null;

  const [activeWine, setActiveWine] = useState(0);
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

    const elements = sectionRef.current?.querySelectorAll('.fade-up, .slide-in-left, .slide-in-right');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const wines = wineShowcaseConfig.wines;
  const features = wineShowcaseConfig.features;
  const quote = wineShowcaseConfig.quote;
  const wine = wines[activeWine];

  const nextWine = () => setActiveWine((prev) => (prev + 1) % wines.length);
  const prevWine = () => setActiveWine((prev) => (prev - 1 + wines.length) % wines.length);

  return (
    <section
      id="collection"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-cream-500"
    >
      {/* Subtle Texture Overlay */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #004F9F 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="container-custom relative">
        {/* Section Title */}
        <div className="fade-up text-center mb-16">
          <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{wineShowcaseConfig.scriptText}</span>
          <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
            {wineShowcaseConfig.subtitle}
          </span>
          <h2 className="font-serif text-h1 text-ink-800">{wineShowcaseConfig.mainTitle}</h2>
          {/* Decorative separator */}
          <div className="separator-ornament mt-6">
            <span className="text-mediterranean-400">◆</span>
          </div>
        </div>

        {/* Wine Tabs */}
        <div className="fade-up flex justify-center gap-2 mb-16" style={{ transitionDelay: '0.1s' }}>
          {wines.map((w, i) => (
            <button
              key={w.id}
              onClick={() => setActiveWine(i)}
              className={`px-6 py-3 text-sm transition-all duration-300 border ${
                i === activeWine
                  ? 'bg-mediterranean-700 text-white border-mediterranean-700'
                  : 'bg-white text-ink-700 hover:bg-mediterranean-100 border-beige-700'
              }`}
              style={{ borderRadius: '0.125rem' }}
            >
              {w.name}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
          {/* Left: Wine Info */}
          <div className="slide-in-left lg:col-span-2 order-2 lg:order-1">
            {/* Year + Name */}
            <div className="mb-8">
              <div className="flex items-baseline gap-4 mb-3">
                <span className="font-serif text-6xl lg:text-7xl text-mediterranean-200 leading-none">{wine.year}</span>
                <div>
                  <h2 className="font-serif text-h3 text-ink-800 leading-tight">{wine.name}</h2>
                  <span className="font-serif italic text-xl text-mediterranean-600">{wine.subtitle}</span>
                </div>
              </div>
              <div className="w-16 h-px bg-mediterranean-400 mt-4" />
            </div>

            {/* Description */}
            <p className="text-ink-700 leading-relaxed mb-4">{wine.description}</p>
            <p className="text-ink-600 leading-relaxed text-sm mb-8">{wine.tastingNotes}</p>

            {/* Tasting Notes */}
            <div className="flex gap-6 mb-8">
              <div>
                <div className="font-serif text-2xl text-mediterranean-700">{wine.alcohol}</div>
                <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-1">Ingredient</div>
              </div>
              <div className="w-px bg-beige-700" />
              <div>
                <div className="font-serif text-2xl text-mediterranean-700">{wine.temperature}</div>
                <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-1">Temp</div>
              </div>
              <div className="w-px bg-beige-700" />
              <div>
                <div className="font-serif text-2xl text-mediterranean-700">{wine.aging}</div>
                <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-1">Freshness</div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => {
                const element = document.querySelector('#contact');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn-primary flex items-center gap-2 group"
              aria-label={wineShowcaseConfig.mainTitle}
            >
              {wineShowcaseConfig.mainTitle}
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>

          {/* Center: Wine Bottle */}
          <div className="lg:col-span-1 order-1 lg:order-2 flex justify-center">
            <div className="relative" style={{ width: '220px', height: '520px' }}>
              {/* Glow */}
              <div className={`absolute inset-0 flex items-center justify-center pointer-events-none`}>
                <div className={`w-48 h-48 ${wine.glowColor} rounded-full blur-3xl transition-colors duration-700`} />
              </div>

              {/* Bottles */}
              {wines.map((w, i) => (
                <img
                  key={w.id}
                  src={w.image}
                  alt={`${w.name} - ${w.subtitle} ${w.year}`}
                  loading={i === 0 ? undefined : 'lazy'}
                  style={w.filter ? { filter: w.filter } : undefined}
                  className={`absolute inset-0 w-full h-full object-contain z-10 drop-shadow-2xl transition-all duration-700 ${
                    i === activeWine
                      ? 'opacity-100 scale-100 translate-y-0'
                      : i < activeWine
                        ? 'opacity-0 scale-90 -translate-y-6 pointer-events-none'
                        : 'opacity-0 scale-90 translate-y-6 pointer-events-none'
                  }`}
                />
              ))}

              {/* Switcher Arrows */}
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 z-20">
                <button
                  onClick={prevWine}
                  className="w-9 h-9 flex items-center justify-center text-ink-700 hover:bg-mediterranean-700 hover:text-white border border-beige-700 hover:border-mediterranean-700 transition-all duration-300"
                  style={{ borderRadius: '0.125rem' }}
                  aria-label="Previous tiramisu"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-ink-500 font-serif tabular-nums whitespace-nowrap">
                  {activeWine + 1} / {wines.length}
                </span>
                <button
                  onClick={nextWine}
                  className="w-9 h-9 flex items-center justify-center text-ink-700 hover:bg-mediterranean-700 hover:text-white border border-beige-700 hover:border-mediterranean-700 transition-all duration-300"
                  style={{ borderRadius: '0.125rem' }}
                  aria-label="Next tiramisu"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Features + Quote */}
          <div className="slide-in-right lg:col-span-2 order-3">
            <div className="space-y-6">
              {features.map((feature) => {
                const IconComponent = iconMap[feature.icon] || Wine;
                return (
                  <div
                    key={feature.title}
                    className="flex items-start gap-4 group"
                  >
                    <div className="w-12 h-12 border border-beige-700 flex items-center justify-center flex-shrink-0 group-hover:border-mediterranean-400 transition-colors bg-white">
                      <IconComponent className="w-5 h-5 text-mediterranean-700" />
                    </div>
                    <div>
                      <h3 className="font-serif text-lg text-ink-800 mb-1">{feature.title}</h3>
                      <p className="text-sm text-ink-600 leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quote */}
            {quote.text && (
              <div className="mt-10 p-6 bg-white border-l-2 border-mediterranean-400">
                {quote.prefix && <p className="font-serif italic text-xl text-mediterranean-600 mb-2">{quote.prefix}</p>}
                <p className="text-ink-600 text-sm italic leading-relaxed">
                  "{quote.text}"
                </p>
                {quote.attribution && <p className="text-mediterranean-700 text-xs mt-3">— {quote.attribution}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
