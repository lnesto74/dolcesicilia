export function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Returns a user-facing warning if the number looks too short/invalid for WhatsApp. */
export function getPhoneValidationWarning(phone) {
  if (!phone || phone.startsWith('pending-')) return 'No phone number yet';

  const d = phoneDigits(phone);

  if (d.startsWith('65')) {
    if (d.length !== 10) return 'Singapore number should be +65 followed by 8 digits';
    return null;
  }

  if (d.startsWith('60')) {
    const local = d.slice(2);
    if (local.length < 9 || local.length > 10) {
      return `Malaysia number looks incomplete (${phone}) — need 9–10 digits after +60`;
    }
    return null;
  }

  if (d.length < 10) return `Phone looks too short for WhatsApp (${phone})`;
  return null;
}

export function isLikelyValidWhatsAppPhone(phone) {
  return getPhoneValidationWarning(phone) == null;
}
