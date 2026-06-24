export const WHATSAPP_NUMBER = "6591329303";

export const HOST_INQUIRY_MESSAGE =
  "Hi, I'd like to host a Dolce Sicilia smart fridge in my building.";

export function getWhatsAppUrl(message = HOST_INQUIRY_MESSAGE): string {
  const number =
    process.env.NEXT_PUBLIC_WHATSAPP?.replace(/\D/g, "") || WHATSAPP_NUMBER;
  const base = `https://wa.me/${number}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function formatWhatsAppDisplay(number = WHATSAPP_NUMBER): string {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("65") && digits.length === 10) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return `+${digits}`;
}
