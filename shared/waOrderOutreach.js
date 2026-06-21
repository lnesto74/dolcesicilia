/** Facebook / Meta ad WhatsApp outreach — Chef Luca voice. */

export const WA_ORDER_TRIGGER_URL =
  'https://wa.me/6591329303?text=Hi%20Chef%20Luca!%20I%27d%20like%20to%20order%20tiramis%C3%B9%20%F0%9F%8D%B0';

export const WA_CATALOG_URL = 'https://wa.me/c/6591329303';
export const GRAB_STORE_URL = 'https://r.grab.com/o/FjYFNJru';

export function buildFacebookAdWhatsAppMessage() {
  return [
    '🍮 Handmade Sicilian tiramisù, fresh every day — Dolce Sicilia.',
    'Classic, Pistachio or Orange Liqueur, made by hand the morning of and delivered to your door. Perfect for a sweet moment with friends, and our big sharing trays make birthdays & parties unforgettable. 🍃',
    `👉 Browse the menu & order on WhatsApp: ${WA_CATALOG_URL}`,
    '',
    'Chef Luca takes it from there — delivery time, address, done.',
    `🛵 In-zone on Grab: ${GRAB_STORE_URL}`,
    '',
    '🌐 tiramisusg.com · ☎️ +65 9132 9303',
  ].join('\n');
}
