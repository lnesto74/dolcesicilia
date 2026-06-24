import { SicilyIcon } from "./SicilyIcon";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function Footer() {
  const whatsappUrl = getWhatsAppUrl();
  const igUrl = process.env.NEXT_PUBLIC_IG_URL;
  const fbUrl = process.env.NEXT_PUBLIC_FB_URL;

  return (
    <footer className="border-t border-gold/20 bg-cream py-12" role="contentinfo">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
          <div className="flex items-center gap-3">
            <SicilyIcon className="h-10 w-10 text-navy" />
            <div>
              <p className="font-serif text-lg text-navy">Dolce Sicilia</p>
              <p className="text-sm text-charcoal/70">Authentic Sicilian recipe. Handmade daily.</p>
            </div>
          </div>

          <nav aria-label="Footer links" className="flex flex-wrap justify-center gap-4 text-sm text-charcoal/70">
            <a
              href="https://tiramisusg.com"
              className="transition-colors hover:text-navy"
              rel="noopener noreferrer"
            >
              tiramisusg.com
            </a>
            <a href="mailto:ln@ulisse.tech" className="transition-colors hover:text-navy">
              ln@ulisse.tech
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-navy"
            >
              WhatsApp
            </a>
            {igUrl && (
              <a href={igUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-navy">
                Instagram
              </a>
            )}
            {fbUrl && (
              <a href={fbUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-navy">
                Facebook
              </a>
            )}
          </nav>
        </div>

        <p className="mt-8 text-center text-xs text-charcoal/50 md:text-left">
          &copy; {new Date().getFullYear()} Dolce Sicilia. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
