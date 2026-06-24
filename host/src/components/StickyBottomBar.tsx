"use client";

import { useEffect, useState } from "react";
import { scrollToId } from "@/lib/scroll";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { WhatsAppIcon } from "./WhatsAppIcon";

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
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-[#25D366] py-3 text-sm font-medium text-white"
        >
          <WhatsAppIcon className="h-5 w-5" />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => scrollToId("contact")}
          className="rounded-sm border border-gold/40 px-4 py-3 text-sm text-cream"
        >
          Become a Host
        </button>
      </div>
    </div>
  );
}
