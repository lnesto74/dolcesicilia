export const MESSAGE_TEMPLATES = [
  {
    id: 'welcome-first-order',
    name: 'Welcome — First Order',
    description: 'Thank new customers for their first Dolce Sicilia order',
    body: `Hi {{firstName}} 😊

Thank you for ordering from Dolce Sicilia and welcome!

We're a small Sicilian family business and we make our tiramisu fresh every day in limited batches, so we really care about what our customers think.

If you enjoyed it, it would mean a lot to us if you could leave a quick rating or feedback on Grab. It really helps small businesses like ours grow ❤️

Grazie mille and hope to serve you again soon!

Luca 🇮🇹
Dolce Sicilia`,
  },
  {
    id: 'orange-liquor-feedback',
    name: 'Orange Liquor Tiramisu — Feedback',
    description: 'Ask for feedback after trying the Orange Liquor Tiramisu',
    body: `Hi {{firstName}},

I'm Luca, the chef and owner of Dolce Sicilia 😊

I just wanted to personally thank you for trying our new Orange Liquor Tiramisu. It's a recent recipe we've introduced, and we're always looking for ways to improve and refine our desserts.

I'd love to hear your honest feedback — did you enjoy it? Was there anything you particularly liked or think we could do better?

If you enjoyed your experience, it would also mean a lot to our small Sicilian family business if you could leave us a rating or review on Grab. Every review helps us grow and continue making fresh tiramisu every morning.

Grazie mille for your support and have a wonderful evening! 🇮🇹☕️

Luca
Chef & Founder
Dolce Sicilia 💙`,
  },
  {
    id: 'general-feedback',
    name: 'General — Feedback & Review',
    description: 'Ask for general feedback and a Grab review',
    body: `Hi {{firstName}} 😊

I'm Luca from Dolce Sicilia — thank you again for your order!

We'd love to hear how you found our tiramisu. Your honest feedback helps us improve every batch we make fresh each morning.

If you enjoyed it, a quick rating on Grab would mean the world to our small Sicilian family business ❤️

Grazie mille!

Luca 🇮🇹
Dolce Sicilia`,
  },
];

export function firstNameFromFullName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'Unknown') return 'there';
  return trimmed.split(/\s+/)[0];
}

export function fillTemplate(body, name) {
  const firstName = firstNameFromFullName(name);
  return body.replace(/\{\{firstName\}\}/g, firstName).replace(/\{\{name\}\}/g, name);
}

export function whatsappPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('65') && digits.length >= 10) return digits;
  if (digits.length === 8 && /^[689]/.test(digits)) return `65${digits}`;
  return digits;
}

export function whatsappUrl(phone, message) {
  return `https://wa.me/${whatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
}
