import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown, Wine, Home, BookOpen, Newspaper, Users, Mail, Grape, ShoppingBag } from 'lucide-react';
import { navigationConfig } from '../config';

// Icon lookup map for dynamic icon resolution from config strings
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, BookOpen, Newspaper, Users, Mail, Grape, Wine, Menu, X, ChevronDown, ShoppingBag,
};

export function Navigation() {
  // Null check: if config is empty, render nothing
  if (!navigationConfig.brandName) return null;

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
    setActiveDropdown(null);
  };

  const navLinks = navigationConfig.navLinks;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${
        isScrolled
          ? 'bg-cream-500/95 backdrop-blur-md py-3 border-beige-700'
          : 'bg-cream-500/80 backdrop-blur-sm py-5 border-transparent'
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container-custom flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => scrollToSection('#hero')}
          className="flex items-center gap-2 md:gap-3 group"
          aria-label={navigationConfig.brandName}
        >
          <Wine className="w-7 h-7 md:w-8 md:h-8 text-mediterranean-700 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="font-serif text-lg md:text-xl text-ink-800 tracking-wide">{navigationConfig.brandName}</span>
            <span className="text-[9px] md:text-[10px] text-mediterranean-600 tracking-widest uppercase">{navigationConfig.tagline}</span>
          </div>
        </button>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-8" role="menubar">
          {navLinks.map((link) => (
              <div
                key={link.name}
                className="relative"
                onMouseEnter={() => link.dropdown && setActiveDropdown(link.name)}
                onMouseLeave={() => setActiveDropdown(null)}
                role="none"
              >
                <button
                  onClick={() => !link.dropdown && scrollToSection(link.href)}
                  className="flex items-center gap-1 text-sm text-ink-700 hover:text-mediterranean-700 transition-colors duration-300 py-2"
                  role="menuitem"
                  aria-haspopup={link.dropdown ? 'true' : undefined}
                  aria-expanded={link.dropdown ? activeDropdown === link.name : undefined}
                >
                  {link.name}
                  {link.dropdown && (
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${
                      activeDropdown === link.name ? 'rotate-180' : ''
                    }`} aria-hidden="true" />
                  )}
                </button>

                {/* Dropdown Menu */}
                {link.dropdown && (
                  <div
                    className={`absolute top-full left-0 pt-2 transition-all duration-300 ${
                      activeDropdown === link.name
                        ? 'opacity-100 visible translate-y-0'
                        : 'opacity-0 invisible -translate-y-2'
                    }`}
                    role="menu"
                  >
                    <div className="bg-white rounded-sm overflow-hidden min-w-[180px] border border-beige-700 shadow-lg">
                      {link.dropdown.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => scrollToSection(item.href)}
                          className="block w-full text-left px-4 py-3 text-sm text-ink-700 hover:bg-mediterranean-100 hover:text-mediterranean-700 transition-colors"
                          role="menuitem"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          ))}
        </div>

        {/* CTA Button */}
        {navigationConfig.ctaButtonText && (
          <button
            onClick={() => scrollToSection('#contact')}
            className="hidden lg:block btn-primary"
            aria-label={navigationConfig.ctaButtonText}
          >
            {navigationConfig.ctaButtonText}
          </button>
        )}

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-ink-800"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`lg:hidden fixed inset-0 bg-cream-500/98 backdrop-blur-lg transition-all duration-500 overflow-y-auto ${
          isMobileMenuOpen
            ? 'opacity-100 visible'
            : 'opacity-0 invisible pointer-events-none'
        }`}
        style={{ top: isScrolled ? '60px' : '76px' }}
        role="menu"
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="container-custom py-6 pb-20 flex flex-col gap-2">
          {navLinks.map((link, index) => {
            const IconComponent = iconMap[link.icon];
            return (
              <div
                key={link.name}
                className="animate-fade-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {link.dropdown ? (
                  <div>
                    <button
                      onClick={() => setActiveDropdown(activeDropdown === link.name ? null : link.name)}
                      className="flex items-center justify-between w-full py-4 text-lg text-ink-800 border-b border-beige-700"
                      aria-expanded={activeDropdown === link.name}
                      role="menuitem"
                    >
                      <span className="flex items-center gap-3">
                        {IconComponent && <IconComponent className="w-5 h-5 text-mediterranean-700" />}
                        {link.name}
                      </span>
                      <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${
                        activeDropdown === link.name ? 'rotate-180' : ''
                      }`} aria-hidden="true" />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-500 ${
                        activeDropdown === link.name ? 'max-h-40' : 'max-h-0'
                      }`}
                      role="menu"
                    >
                      {link.dropdown.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => scrollToSection(item.href)}
                          className="block w-full text-left pl-12 py-3 text-ink-600 hover:text-mediterranean-700"
                          role="menuitem"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => scrollToSection(link.href)}
                    className="flex items-center gap-3 w-full py-4 text-lg text-ink-800 border-b border-beige-700 hover:text-mediterranean-700 transition-colors"
                    role="menuitem"
                  >
                    {IconComponent && <IconComponent className="w-5 h-5 text-mediterranean-700" />}
                    {link.name}
                  </button>
                )}
              </div>
            );
          })}

          {navigationConfig.ctaButtonText && (
            <button
              onClick={() => scrollToSection('#contact')}
              className="btn-primary mt-6 text-center"
              role="menuitem"
            >
              {navigationConfig.ctaButtonText}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
