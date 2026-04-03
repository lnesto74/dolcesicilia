import { useState, useEffect, useRef } from 'react';
import { Send, CheckCircle, AlertCircle, MapPin, Phone, Mail, Clock } from 'lucide-react';
import { contactFormConfig } from '../config';

// Icon lookup map for dynamic icon resolution from config strings
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin, Phone, Mail, Clock,
};

export function ContactForm() {
  // Null check: if config is empty, render nothing
  if (!contactFormConfig.mainTitle) return null;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    visitDate: '',
    visitors: '2',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(contactFormConfig.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          visitDate: formData.visitDate,
          visitors: formData.visitors,
          message: formData.message,
        }),
      });

      if (response.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', phone: '', visitDate: '', visitors: '2', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }

    setIsSubmitting(false);
    setTimeout(() => setStatus('idle'), 5000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const form = contactFormConfig.form;

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="section-padding relative overflow-hidden bg-cream-500 border-t border-beige-700"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #004F9F 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
      </div>

      <div className="container-custom relative">
        {/* Section Header */}
        <div className="fade-up text-center mb-16">
          <span className="font-serif italic text-2xl text-mediterranean-600 block mb-2">{contactFormConfig.scriptText}</span>
          <span className="text-mediterranean-700 text-xs uppercase tracking-[0.2em] mb-4 block">
            {contactFormConfig.subtitle}
          </span>
          <h2 className="font-serif text-h1 text-ink-800 mb-4">
            {contactFormConfig.mainTitle}
          </h2>
          {contactFormConfig.introText && (
            <p className="text-ink-600 max-w-2xl mx-auto">
              {contactFormConfig.introText}
            </p>
          )}
          {/* Decorative separator */}
          <div className="separator-ornament mt-6">
            <span className="text-mediterranean-400">◆</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
          {/* Contact Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="slide-in-left" style={{ transitionDelay: '0.1s' }}>
              {contactFormConfig.contactInfoTitle && (
                <h3 className="font-serif text-h5 text-ink-800 mb-6">{contactFormConfig.contactInfoTitle}</h3>
              )}
              <div className="space-y-4" role="list" aria-label="Contact information">
                {contactFormConfig.contactInfo.map((item) => {
                  const IconComponent = iconMap[item.icon];
                  return (
                    <div
                      key={item.label}
                      className="flex items-start gap-4 p-4 bg-white border border-beige-700 hover:border-mediterranean-400 transition-colors"
                      role="listitem"
                    >
                      <div className="w-10 h-10 bg-mediterranean-100 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '50%' }}>
                        {IconComponent && <IconComponent className="w-5 h-5 text-mediterranean-700" />}
                      </div>
                      <div>
                        <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">{item.label}</p>
                        <p className="text-ink-800 font-medium">{item.value}</p>
                        <p className="text-sm text-ink-500">{item.subtext}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            <div className="slide-in-right bg-white border border-beige-700 p-8" style={{ transitionDelay: '0.15s' }}>
              {status === 'success' ? (
                <div className="text-center py-12" role="alert">
                  <CheckCircle className="w-16 h-16 text-mediterranean-600 mx-auto mb-4" />
                  <h3 className="font-serif text-h5 text-ink-800 mb-2">
                    {form.successMessage}
                  </h3>
                </div>
              ) : status === 'error' ? (
                <div className="text-center py-12" role="alert">
                  <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h3 className="font-serif text-h5 text-ink-800 mb-2">
                    {form.errorMessage}
                  </h3>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Name */}
                    <div>
                      <label htmlFor="contact-name" className="block text-sm text-ink-700 mb-2">
                        {form.nameLabel} <span className="text-mediterranean-700">*</span>
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        placeholder={form.namePlaceholder}
                        autoComplete="name"
                        className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 placeholder-ink-400 focus:outline-none focus:border-mediterranean-500 transition-colors"
                        style={{ borderRadius: '0.125rem' }}
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label htmlFor="contact-phone" className="block text-sm text-ink-700 mb-2">
                        {form.phoneLabel} <span className="text-mediterranean-700">*</span>
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        required
                        placeholder={form.phonePlaceholder}
                        autoComplete="tel"
                        className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 placeholder-ink-400 focus:outline-none focus:border-mediterranean-500 transition-colors"
                        style={{ borderRadius: '0.125rem' }}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="contact-email" className="block text-sm text-ink-700 mb-2">
                        {form.emailLabel} <span className="text-mediterranean-700">*</span>
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        placeholder={form.emailPlaceholder}
                        autoComplete="email"
                        className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 placeholder-ink-400 focus:outline-none focus:border-mediterranean-500 transition-colors"
                        style={{ borderRadius: '0.125rem' }}
                      />
                    </div>

                    {/* Visit Date */}
                    <div>
                      <label htmlFor="contact-date" className="block text-sm text-ink-700 mb-2">
                        {form.visitDateLabel} <span className="text-mediterranean-700">*</span>
                      </label>
                      <input
                        id="contact-date"
                        type="date"
                        name="visitDate"
                        value={formData.visitDate}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 focus:outline-none focus:border-mediterranean-500 transition-colors"
                        style={{ borderRadius: '0.125rem' }}
                      />
                    </div>
                  </div>

                  {/* Number of Visitors */}
                  {form.visitorsOptions.length > 0 && (
                    <div>
                      <label htmlFor="contact-visitors" className="block text-sm text-ink-700 mb-2">
                        {form.visitorsLabel}
                      </label>
                      <select
                        id="contact-visitors"
                        name="visitors"
                        value={formData.visitors}
                        onChange={handleChange}
                        className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 focus:outline-none focus:border-mediterranean-500 transition-colors"
                        style={{ borderRadius: '0.125rem' }}
                      >
                        {form.visitorsOptions.map((option) => (
                          <option key={option} value={option} className="bg-cream-500">{option}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Message */}
                  <div>
                    <label htmlFor="contact-message" className="block text-sm text-ink-700 mb-2">
                      {form.messageLabel}
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      rows={4}
                      placeholder={form.messagePlaceholder}
                      className="w-full px-4 py-3 bg-cream-500 border border-beige-700 text-ink-800 placeholder-ink-400 focus:outline-none focus:border-mediterranean-500 transition-colors resize-none"
                      style={{ borderRadius: '0.125rem' }}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {form.submittingText}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {form.submitText}
                      </>
                    )}
                  </button>

                  {contactFormConfig.privacyNotice && (
                    <p className="text-xs text-ink-500 text-center">
                      {contactFormConfig.privacyNotice}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
