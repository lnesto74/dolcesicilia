import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { scrollToTopConfig } from '../config';

export function ScrollToTop() {
  // Null check: if config is empty, render nothing
  if (!scrollToTopConfig.ariaLabel) return null;

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 600);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label={scrollToTopConfig.ariaLabel}
      className={`fixed bottom-8 right-8 z-40 w-12 h-12 bg-mediterranean-700 text-white flex items-center justify-center shadow-lg shadow-mediterranean-700/20 transition-all duration-300 hover:bg-mediterranean-800 hover:scale-110 ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      style={{ borderRadius: '50%' }}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
