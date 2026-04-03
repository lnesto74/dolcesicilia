import { useState, useEffect, useRef } from 'react';
import { History, Award, BookOpen } from 'lucide-react';
import { museumConfig } from '../config';

// Icon lookup map for dynamic icon resolution from config strings
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  History, Award, BookOpen,
};

export function Museum() {
  // Null check: if config is empty, render nothing
  if (!museumConfig.mainTitle) return null;

  const [activeTab, setActiveTab] = useState(museumConfig.tabs[0]?.id || '');
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

  const activeTabData = museumConfig.tabs.find(tab => tab.id === activeTab);

  return (
    <section
      id="story"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-cream-500"
    >
      {/* Background Accent */}
      <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-mediterranean-100 to-transparent" />

      <div className="container-custom relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Left Content */}
          <div>
            {/* Section Header */}
            <div className="slide-in-left mb-10">
              <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{museumConfig.scriptText}</span>
              <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
                {museumConfig.subtitle}
              </span>
              <h2 className="font-serif text-h1 text-ink-800 has-bar">
                {museumConfig.mainTitle}
              </h2>
            </div>

            {/* Introduction */}
            {museumConfig.introText && (
              <p className="fade-up text-ink-700 leading-relaxed mb-10" style={{ transitionDelay: '0.1s' }}>
                {museumConfig.introText}
              </p>
            )}

            {/* Tabs */}
            {museumConfig.tabs.length > 0 && (
              <div className="fade-up flex flex-wrap gap-2 mb-8" style={{ transitionDelay: '0.15s' }}>
                {museumConfig.tabs.map((tab) => {
                  const IconComponent = iconMap[tab.icon];
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      aria-pressed={activeTab === tab.id}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-all duration-300 border ${
                        activeTab === tab.id
                          ? 'bg-mediterranean-700 text-white border-mediterranean-700'
                          : 'bg-white text-ink-700 hover:bg-mediterranean-100 border-beige-700'
                      }`}
                      style={{ borderRadius: '0.125rem' }}
                    >
                      {IconComponent && <IconComponent className="w-4 h-4" />}
                      {tab.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab Content */}
            <div className="fade-up" style={{ transitionDelay: '0.2s' }}>
              {activeTabData && (
                <div className="p-6 bg-white border border-beige-700 transition-all duration-300">
                  <h3 className="font-serif text-h5 text-ink-800 mb-4">
                    {activeTabData.content.title}
                  </h3>
                  <p className="text-ink-700 leading-relaxed mb-4">
                    {activeTabData.content.description}
                  </p>
                  <div className="flex items-center gap-3 text-mediterranean-700">
                    <div className="w-8 h-px bg-mediterranean-400" />
                    <span className="text-sm font-medium">
                      {activeTabData.content.highlight}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Horizontal Timeline */}
            {museumConfig.timeline.length > 0 && (
              <div className="fade-up mt-8" style={{ transitionDelay: '0.25s' }}>
                <div className="relative">
                  {/* Horizontal line */}
                  <div className="absolute top-3 left-0 right-0 h-px bg-mediterranean-300" />
                  {/* Timeline points */}
                  <div className="flex justify-between overflow-x-auto gap-2">
                    {museumConfig.timeline.map((event) => (
                      <div key={event.year} className="relative flex flex-col items-center flex-shrink-0 min-w-[70px]">
                        <div className="w-2.5 h-2.5 bg-cream-500 border-2 border-mediterranean-500 z-10" style={{ borderRadius: '50%' }} />
                        <span className="font-serif text-sm text-mediterranean-700 mt-2">{event.year}</span>
                        <span className="text-[11px] text-ink-500 mt-0.5 text-center whitespace-nowrap">{event.event}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Founder Photo & Quote */}
            {museumConfig.quote.text && (
              <div className="fade-up mt-8 flex items-center gap-6" style={{ transitionDelay: '0.3s' }}>
                {museumConfig.founderPhoto && (
                  <div className="w-24 h-24 overflow-hidden border-2 border-beige-700 shadow-lg flex-shrink-0" style={{ borderRadius: '0.125rem' }}>
                    <img
                      src={museumConfig.founderPhoto}
                      alt={museumConfig.founderPhotoAlt}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div>
                  {museumConfig.quote.prefix && (
                    <p className="font-serif italic text-xl text-mediterranean-600 mb-1">
                      &ldquo;{museumConfig.quote.prefix}&rdquo;
                    </p>
                  )}
                  <p className="text-ink-600 text-sm italic">
                    "{museumConfig.quote.text}"
                  </p>
                  {museumConfig.quote.attribution && (
                    <p className="text-mediterranean-700 text-xs mt-2">
                      — {museumConfig.quote.attribution}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Image */}
          <div className="slide-in-right relative" style={{ transitionDelay: '0.15s' }}>
            <div className="relative aspect-[4/5] overflow-hidden border border-beige-700">
              {museumConfig.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`absolute inset-0 transition-all duration-500 ${
                    activeTab === tab.id
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-105'
                  }`}
                >
                  <img
                    src={tab.image}
                    alt={`${tab.name} - ${museumConfig.mainTitle}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                </div>
              ))}

              {/* Year Badge */}
              {museumConfig.yearBadge && (
                <div className="absolute top-6 right-6 w-24 h-24 bg-white/90 backdrop-blur-sm border border-beige-700 flex items-center justify-center" style={{ borderRadius: '50%' }}>
                  <div className="text-center">
                    <div className="font-serif text-2xl text-mediterranean-700">{museumConfig.yearBadge}</div>
                    <div className="text-[10px] text-ink-600 uppercase tracking-wider">{museumConfig.yearBadgeLabel}</div>
                  </div>
                </div>
              )}

              {/* Bottom Info */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    {museumConfig.openingHoursLabel && <p className="text-cream-500 text-sm">{museumConfig.openingHoursLabel}</p>}
                    {museumConfig.openingHours && <p className="text-white text-lg">{museumConfig.openingHours}</p>}
                  </div>
                  {museumConfig.ctaButtonText && (
                    <button
                      onClick={() => {
                        const element = document.querySelector('#contact');
                        if (element) element.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="btn-primary text-sm px-6"
                      aria-label={museumConfig.ctaButtonText}
                    >
                      {museumConfig.ctaButtonText}
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
