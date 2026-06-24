"use client";

import { useEffect, useState } from "react";
import { scrollToId } from "@/lib/scroll";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function StickyBottomBar() {
  const [visible, setVisible] = useState(false);
  const whatsappUrl = getWhatsAppUrl();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gold/30 bg-navy/95 p-3 backdrop-blur-md sm:hidden"
      role="complementary"
      aria-label="Quick actions"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => scrollToId("lead-form")}
          className="flex-1 rounded-sm bg-pistachio py-3 text-sm font-medium text-white"
        >
          Become a Host
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-sm border border-gold/40 px-4 py-3 text-sm text-cream"
          aria-label="Chat on WhatsApp"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
