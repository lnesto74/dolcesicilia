import { useState } from 'react';
import { Wine, MapPin, Phone, Mail, Instagram, Facebook, Twitter, Youtube, ArrowUp, CheckCircle } from 'lucide-react';
import { footerConfig } from '../config';

// Icon lookup map for dynamic icon resolution from config strings
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wine, MapPin, Phone, Mail, Instagram, Facebook, Twitter, Youtube, ArrowUp,
};

export function Footer() {
  // Null check: if config is empty, render nothing
  if (!footerConfig.brandName) return null;

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;

    try {
      const response = await fetch(footerConfig.newsletterEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newsletterEmail,
        }),
      });

      if (response.ok) {
        setNewsletterStatus('success');
        setNewsletterEmail('');
      } else {
        setNewsletterStatus('error');
      }
    } catch {
      setNewsletterStatus('error');
    }

    setTimeout(() => setNewsletterStatus('idle'), 4000);
  };

  return (
    <footer className="relative bg-cream-500 border-t border-beige-700" role="contentinfo">
      {/* Main Footer */}
      <div className="container-custom py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <Wine className="w-8 h-8 text-mediterranean-700" aria-hidden="true" />
              <div>
                <span className="font-serif text-xl text-ink-800 block">{footerConfig.brandName}</span>
                {footerConfig.tagline && (
                  <span className="text-[10px] text-mediterranean-600 tracking-widest uppercase">{footerConfig.tagline}</span>
                )}
              </div>
            </div>
            {footerConfig.description && (
              <p className="text-ink-600 text-sm leading-relaxed mb-6">
                {footerConfig.description}
              </p>
            )}
            {/* Social Links */}
            {footerConfig.socialLinks.length > 0 && (
              <nav aria-label="Social media links">
                <div className="flex gap-3">
                  {footerConfig.socialLinks.map((social) => {
                    const IconComponent = iconMap[social.icon];
                    return (
                      <a
                        key={social.label}
                        href={social.href}
                        aria-label={social.label}
                        className="w-10 h-10 bg-white border border-beige-700 flex items-center justify-center text-ink-600 hover:bg-mediterranean-700 hover:border-mediterranean-700 hover:text-white transition-all duration-300"
                        style={{ borderRadius: '50%' }}
                      >
                        {IconComponent && <IconComponent className="w-4 h-4" />}
                      </a>
                    );
                  })}
                </div>
              </nav>
            )}
          </div>

          {/* Link Groups */}
          {footerConfig.linkGroups.map((group, index) => (
            <nav key={index} aria-label={group.title}>
              <h3 className="font-serif text-lg text-ink-800 mb-5">{group.title}</h3>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.name}>
                    <button
                      onClick={() => scrollToSection(link.href)}
                      className="text-ink-600 text-sm hover:text-mediterranean-700 transition-colors"
                    >
                      {link.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Contact Info + Newsletter */}
          <div>
            {footerConfig.contactItems.length > 0 && (
              <>
                <h3 className="font-serif text-lg text-ink-800 mb-5">{footerConfig.linkGroups.length > 0 ? footerConfig.linkGroups[footerConfig.linkGroups.length - 1]?.title : ''}</h3>
                <ul className="space-y-4">
                  {footerConfig.contactItems.map((item, index) => {
                    const IconComponent = iconMap[item.icon];
                    return (
                      <li key={index} className="flex items-start gap-3">
                        {IconComponent && <IconComponent className="w-4 h-4 text-mediterranean-700 mt-0.5 flex-shrink-0" aria-hidden="true" />}
                        <span className="text-ink-600 text-sm">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* Newsletter */}
            {footerConfig.newsletterLabel && (
              <div className="mt-6 pt-6 border-t border-beige-700">
                <p className="text-ink-600 text-sm mb-3">{footerConfig.newsletterLabel}</p>
                {newsletterStatus === 'success' ? (
                  <div className="flex items-center gap-2 text-mediterranean-700 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>{footerConfig.newsletterSuccessText}</span>
                  </div>
                ) : (
                  <form onSubmit={handleNewsletter} className="flex gap-2">
                    <label htmlFor="newsletter-email" className="sr-only">{footerConfig.newsletterLabel}</label>
                    <input
                      id="newsletter-email"
                      type="email"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      placeholder={footerConfig.newsletterPlaceholder}
                      required
                      autoComplete="email"
                      className="flex-1 px-3 py-2 bg-white border border-beige-700 text-ink-800 text-sm placeholder-ink-400 focus:outline-none focus:border-mediterranean-500 transition-colors"
                      style={{ borderRadius: '0.125rem' }}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-mediterranean-700 text-white text-sm hover:bg-mediterranean-800 transition-colors"
                      style={{ borderRadius: '0.125rem' }}
                    >
                      {footerConfig.newsletterButtonText}
                    </button>
                  </form>
                )}
                {newsletterStatus === 'error' && (
                  <p className="text-red-500 text-xs mt-2">{footerConfig.newsletterErrorText}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-beige-700">
        <div className="container-custom py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-ink-500 text-xs">
            {footerConfig.copyrightText && (
              <span>&copy; {new Date().getFullYear()} {footerConfig.copyrightText}</span>
            )}
            {footerConfig.legalLinks.map((link, index) => (
              <span key={index}>
                <span className="hidden md:inline">|</span>
                <button className="hover:text-mediterranean-700 transition-colors ml-2 md:ml-0">{link}</button>
              </span>
            ))}
            {footerConfig.icpText && (
              <>
                <span className="hidden md:inline">|</span>
                <span>{footerConfig.icpText}</span>
              </>
            )}
          </div>

          {/* Back to Top */}
          {footerConfig.backToTopText && (
            <button
              onClick={scrollToTop}
              className="flex items-center gap-2 text-ink-600 text-sm hover:text-mediterranean-700 transition-colors group"
              aria-label={footerConfig.backToTopText}
            >
              <span>{footerConfig.backToTopText}</span>
              <div className="w-8 h-8 border border-beige-700 flex items-center justify-center group-hover:border-mediterranean-700 group-hover:bg-mediterranean-700 group-hover:text-white transition-all duration-300" style={{ borderRadius: '50%' }}>
                <ArrowUp className="w-4 h-4" />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Age Verification Note */}
      {footerConfig.ageVerificationText && (
        <div className="bg-beige-700 py-3">
          <div className="container-custom">
            <p className="text-center text-ink-600 text-xs">
              {footerConfig.ageVerificationText}
            </p>
          </div>
        </div>
      )}
    </footer>
  );
}
