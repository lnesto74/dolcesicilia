"use client";

import { ScrollReveal } from "./ScrollReveal";
import { GoldDivider } from "./GoldDivider";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { formatWhatsAppDisplay, getWhatsAppUrl } from "@/lib/whatsapp";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function trackLead() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "Lead");
  }
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "generate_lead", { event_category: "host", event_label: "whatsapp" });
  }
}

export function HostContact() {
  const whatsappUrl = getWhatsAppUrl();

  return (
    <section id="contact" className="bg-navy py-16 sm:py-24">
      <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Get started</p>
          <h2 className="mt-3 font-serif text-3xl text-cream sm:text-4xl">
            Become a Host Partner
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />
          <p className="mt-8 text-lg leading-relaxed text-cream/80">
            Message Chef Luca on WhatsApp — tell us your building name and location. It&apos;s free,
            it&apos;s easy, it pays.
          </p>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackLead}
            className="mt-10 inline-flex w-full items-center justify-center gap-3 rounded-sm bg-[#25D366] px-6 py-4 text-lg font-medium text-white transition-all hover:brightness-110 hover:shadow-lg sm:w-auto"
          >
            <WhatsAppIcon className="h-6 w-6" />
            WhatsApp us on {formatWhatsAppDisplay()}
          </a>

          <p className="mt-6 text-sm text-cream/50">
            We reply within 1 business day on WhatsApp Business.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
