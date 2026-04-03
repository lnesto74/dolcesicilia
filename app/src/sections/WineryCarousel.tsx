import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { wineryCarouselConfig, navigationConfig } from '../config';

export function WineryCarousel() {
  // Null check: if config is empty, render nothing
  if (!wineryCarouselConfig.mainTitle || wineryCarouselConfig.slides.length === 0) return null;

  const slides = wineryCarouselConfig.slides;

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
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

  const goToSlide = (index: number, dir: 'next' | 'prev' = 'next') => {
    if (isAnimating) return;
    setIsAnimating(true);
    setDirection(dir);
    setCurrentSlide(index);
    setTimeout(() => setIsAnimating(false), 600);
  };

  const nextSlide = () => {
    goToSlide((currentSlide + 1) % slides.length, 'next');
  };

  const prevSlide = () => {
    goToSlide((currentSlide - 1 + slides.length) % slides.length, 'prev');
  };

  // Auto-advance slides
  useEffect(() => {
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [currentSlide]);

  return (
    <section
      id="experience"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-cream-500 border-y border-beige-700"
    >
      {/* Background Pattern - subtle */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(45deg, #004F9F 25%, transparent 25%), linear-gradient(-45deg, #004F9F 25%, transparent 25%)`,
          backgroundSize: '60px 60px',
          backgroundPosition: '0 0, 30px 0'
        }} />
      </div>

      <div className="container-custom relative">
        {/* Section Header */}
        <div className="fade-up text-center mb-12">
          <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{wineryCarouselConfig.scriptText}</span>
          <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
            {wineryCarouselConfig.subtitle}
          </span>
          <h2 className="font-serif text-h1 text-ink-800">
            {wineryCarouselConfig.mainTitle}
          </h2>
          {/* Decorative separator */}
          <div className="separator-ornament mt-6">
            <span className="text-mediterranean-400">◆</span>
          </div>
        </div>

        {/* Carousel */}
        <div className="slide-in-left" style={{ transitionDelay: '0.1s' }}>
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-0 items-stretch">
            {/* Image Side with Ken Burns */}
            <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[500px] overflow-hidden border border-beige-700 lg:border-r-0">
              {slides.map((slide, index) => (
                <div
                  key={index}
                  className={`absolute inset-0 transition-all duration-600 ease-out ${
                    index === currentSlide
                      ? 'opacity-100 scale-100 z-10'
                      : index === (currentSlide - 1 + slides.length) % slides.length && direction === 'next'
                        ? 'opacity-0 -translate-x-full z-0'
                        : index === (currentSlide + 1) % slides.length && direction === 'prev'
                          ? 'opacity-0 translate-x-full z-0'
                          : 'opacity-0 z-0'
                  }`}
                >
                  <img
                    src={slide.image}
                    alt={`${slide.title} - ${slide.description}`}
                    loading="lazy"
                    className={`w-full h-full object-cover ${index === currentSlide ? 'kenburns' : ''}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              ))}

              {/* Navigation Arrows */}
              <div className="absolute bottom-6 left-6 flex gap-3 z-20">
                <button
                  onClick={prevSlide}
                  className="w-12 h-12 bg-white/90 backdrop-blur-sm border border-beige-700 flex items-center justify-center text-ink-700 hover:bg-mediterranean-700 hover:text-white hover:border-mediterranean-700 transition-all duration-300"
                  style={{ borderRadius: '0.125rem' }}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextSlide}
                  className="w-12 h-12 bg-white/90 backdrop-blur-sm border border-beige-700 flex items-center justify-center text-ink-700 hover:bg-mediterranean-700 hover:text-white hover:border-mediterranean-700 transition-all duration-300"
                  style={{ borderRadius: '0.125rem' }}
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Slide Indicators */}
              <div className="absolute bottom-6 right-6 flex gap-2 z-20">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index, index > currentSlide ? 'next' : 'prev')}
                    className={`h-1 transition-all duration-300 ${
                      index === currentSlide
                        ? 'w-8 bg-mediterranean-700'
                        : 'w-4 bg-white/60 hover:bg-white/80'
                    }`}
                    style={{ borderRadius: '0.0625rem' }}
                    aria-label={`Go to slide ${index + 1}: ${slides[index].title}`}
                  />
                ))}
              </div>
            </div>

            {/* Content Side */}
            <div className="lg:bg-white lg:border-y lg:border-r lg:border-beige-700 p-8 lg:p-12 flex flex-col justify-center relative overflow-hidden">
              {slides.map((slide, index) => (
                <div
                  key={index}
                  className={`transition-all duration-500 ${
                    index === currentSlide
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-4 absolute'
                  }`}
                  style={{ display: index === currentSlide ? 'block' : 'none' }}
                >
                  {/* Location Tag */}
                  {wineryCarouselConfig.locationTag && (
                    <div className="flex items-center gap-2 text-mediterranean-700 text-sm mb-4">
                      <MapPin className="w-4 h-4" />
                      <span>{wineryCarouselConfig.locationTag}</span>
                    </div>
                  )}

                  {/* Title */}
                  <h3 className="font-serif text-h3 text-ink-800 mb-2">
                    {slide.title}
                  </h3>
                  <p className="text-ink-600 text-lg mb-6">
                    {slide.subtitle}
                  </p>

                  {/* Area Stats */}
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="font-serif text-5xl lg:text-6xl text-mediterranean-700">
                      {slide.area}
                    </span>
                    <span className="text-ink-600 text-lg">{slide.unit}</span>
                  </div>

                  {/* Description */}
                  <p className="text-ink-700 leading-relaxed mb-8">
                    {slide.description}
                  </p>

                  {/* CTA */}
                  {navigationConfig.ctaButtonText && (
                    <button
                      onClick={() => {
                        const element = document.querySelector('#contact');
                        if (element) element.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="btn-secondary"
                      aria-label={navigationConfig.ctaButtonText}
                    >
                      {navigationConfig.ctaButtonText}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Slide Counter */}
        <div className="fade-up mt-8 flex justify-center lg:justify-start" style={{ transitionDelay: '0.2s' }}>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-serif text-2xl text-mediterranean-700">
              {String(currentSlide + 1).padStart(2, '0')}
            </span>
            <div className="w-12 h-px bg-beige-700" />
            <span className="text-ink-500">
              {String(slides.length).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
