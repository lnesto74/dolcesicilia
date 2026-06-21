import { MessageCircle } from 'lucide-react';
import { WHATSAPP_CATALOG_URL } from '../config';

export function WhatsAppChat() {
  return (
    <a
      href={WHATSAPP_CATALOG_URL}
      className="fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#1ebe57] hover:shadow-xl transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95"
      aria-label="Order on WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  );
}
