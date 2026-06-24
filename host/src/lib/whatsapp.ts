export function getWhatsAppUrl(): string {
  const number = process.env.NEXT_PUBLIC_WHATSAPP?.replace(/\D/g, "") ?? "";
  if (!number) return "https://wa.me/";
  return `https://wa.me/${number}`;
}
