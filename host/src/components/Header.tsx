"use client";

import { useEffect, useState } from "react";
import { SicilyIcon } from "./SicilyIcon";
import { scrollToId } from "@/lib/scroll";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const whatsappUrl = getWhatsAppUrl();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-gold/20 bg-navy/95 py-3 shadow-lg backdrop-blur-md"
          : "bg-navy/80 py-4 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="group flex items-center gap-3" aria-label="Dolce Sicilia home">
          <SicilyIcon className="h-10 w-10 text-gold transition-transform group-hover:scale-105 sm:h-11 sm:w-11" />
          <div>
            <span className="font-serif text-lg text-cream sm:text-xl">Dolce Sicilia</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-gold/80">
              A Spoon of Sicily
            </span>
          </div>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => scrollToId("contact")}
            className="hidden rounded-sm bg-pistachio px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pistachio-dark sm:inline-block"
          >
            Become a Host
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-gold/40 px-3 py-2 text-sm text-cream transition-colors hover:border-gold hover:bg-gold/10"
            aria-label="Chat on WhatsApp"
          >
            <WhatsAppIcon />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </div>
    </header>
  );
}
