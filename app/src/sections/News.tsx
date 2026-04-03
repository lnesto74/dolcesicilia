import { useEffect, useRef } from 'react';
import { ArrowRight, Calendar, Star, Quote } from 'lucide-react';
import { newsConfig } from '../config';

export function News() {
  // Null check: if config is empty, render nothing
  if (!newsConfig.mainTitle) return null;

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

    const elements = sectionRef.current?.querySelectorAll('.fade-up, .slide-in-left, .slide-in-right, .scale-in');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="reviews"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-cream-500"
    >
      {/* Decorative Elements */}
      <div className="absolute left-0 top-1/4 w-64 h-64 bg-mediterranean-100 rounded-full blur-3xl" />
      <div className="absolute right-0 bottom-1/4 w-48 h-48 bg-mediterranean-100 rounded-full blur-3xl" />

      <div className="container-custom relative">
        {/* Section Header */}
        <div className="fade-up flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{newsConfig.scriptText}</span>
            <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
              {newsConfig.subtitle}
            </span>
            <h2 className="font-serif text-h1 text-ink-800 has-bar">
              {newsConfig.mainTitle}
            </h2>
          </div>
          {newsConfig.viewAllText && (
            <button className="btn-secondary flex items-center gap-2 group w-fit" aria-label={newsConfig.viewAllText}>
              {newsConfig.viewAllText}
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          )}
        </div>

        {/* News Grid */}
        {newsConfig.articles.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {newsConfig.articles.map((item, index) => (
              <article
                key={item.id}
                className="fade-up group cursor-pointer"
                style={{ transitionDelay: `${0.1 + index * 0.1}s` }}
              >
                {/* Image */}
                <div className="relative aspect-[3/2] overflow-hidden mb-5 border border-beige-700">
                  <img
                    src={item.image}
                    alt={`${item.title} - ${item.category}`}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Category Badge */}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 bg-mediterranean-700 text-white text-xs" style={{ borderRadius: '0.125rem' }}>
                      {item.category}
                    </span>
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-12 h-12 bg-white/90 flex items-center justify-center" style={{ borderRadius: '50%' }}>
                      <ArrowRight className="w-5 h-5 text-mediterranean-700" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div>
                  {/* Date */}
                  <div className="flex items-center gap-2 text-ink-500 text-sm mb-3">
                    <Calendar className="w-4 h-4" />
                    <span>{item.date}</span>
                  </div>

                  {/* Title */}
                  <h3 className="font-serif text-h5 text-ink-800 mb-3 group-hover:text-mediterranean-700 transition-colors">
                    {item.title}
                  </h3>

                  {/* Excerpt */}
                  <p className="text-ink-600 text-sm leading-relaxed mb-4 line-clamp-3">
                    {item.excerpt}
                  </p>

                  {/* Read More Link */}
                  {newsConfig.readMoreText && (
                    <span className="inline-flex items-center gap-2 text-mediterranean-700 text-sm group-hover:gap-3 transition-all duration-300">
                      {newsConfig.readMoreText}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Testimonials Section */}
        {newsConfig.testimonials.length > 0 && (
          <div className="mt-24">
            <div className="fade-up text-center mb-12">
              <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{newsConfig.testimonialsScriptText}</span>
              <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
                {newsConfig.testimonialsSubtitle}
              </span>
              <h2 className="font-serif text-h2 text-ink-800">
                {newsConfig.testimonialsMainTitle}
              </h2>
              {/* Decorative separator */}
              <div className="separator-ornament mt-6">
                <span className="text-mediterranean-400">◆</span>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {newsConfig.testimonials.map((t, index) => (
                <div
                  key={t.name}
                  className="scale-in p-8 bg-white border border-beige-700 relative"
                  style={{ transitionDelay: `${0.1 + index * 0.1}s` }}
                >
                  <Quote className="w-8 h-8 text-mediterranean-200 absolute top-6 right-6" />
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-mediterranean-500 fill-mediterranean-500" />
                    ))}
                  </div>
                  <p className="text-ink-700 leading-relaxed mb-6 italic">
                    "{t.text}"
                  </p>
                  <div>
                    <p className="text-ink-800 font-medium text-sm">{t.name}</p>
                    <p className="text-ink-500 text-xs">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Story Section */}
        {newsConfig.storyTitle && (
          <div className="fade-up mt-24 pt-20 border-t border-beige-700" style={{ transitionDelay: '0.1s' }}>
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Content */}
              <div className="slide-in-left">
                <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{newsConfig.storyScriptText}</span>
                <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
                  {newsConfig.storySubtitle}
                </span>
                <h2 className="font-serif text-h2 text-ink-800 mb-6">
                  {newsConfig.storyTitle}
                </h2>
                <div className="space-y-4 text-ink-700 leading-relaxed">
                  {newsConfig.storyParagraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>

                {/* Timeline Highlights */}
                {newsConfig.storyTimeline.length > 0 && (
                  <div className="mt-8 grid grid-cols-3 gap-4">
                    {newsConfig.storyTimeline.map((item, index) => (
                      <div key={index} className="text-center p-4 bg-white border border-beige-700">
                        <div className="font-serif text-2xl text-mediterranean-700 mb-1">{item.value}</div>
                        <div className="text-xs text-ink-500">{item.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Image */}
              <div className="slide-in-right relative">
                <div className="relative aspect-[4/5] overflow-hidden border border-beige-700">
                  {newsConfig.storyImage && (
                    <>
                      <img
                        src={newsConfig.storyImage}
                        alt={newsConfig.storyImageCaption}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </>
                  )}
                </div>

                {/* Quote Overlay */}
                {newsConfig.storyQuote.text && (
                  <div className="absolute bottom-6 left-6 right-6 p-6 bg-white/95 backdrop-blur-sm border border-beige-700">
                    {newsConfig.storyQuote.prefix && (
                      <p className="font-serif italic text-xl text-mediterranean-600 mb-1">{newsConfig.storyQuote.prefix}</p>
                    )}
                    <p className="text-ink-700 italic text-sm leading-relaxed mb-2">
                      "{newsConfig.storyQuote.text}"
                    </p>
                    {newsConfig.storyQuote.attribution && (
                      <p className="text-mediterranean-700 text-xs">— {newsConfig.storyQuote.attribution}</p>
                    )}
                  </div>
                )}

                {/* Decorative Frame */}
                <div className="absolute -top-4 -right-4 w-full h-full border border-mediterranean-200 -z-10" />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
