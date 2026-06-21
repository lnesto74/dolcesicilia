export const CUSTOMER_TAG = 'Dolce Sicilia Customer Base';
export const CUSTOMER_ORG = 'Dolce Sicilia';

const PHONE_PATTERNS = [
  /\+65\s*\d{4}\s*\d{4}/g,
  /\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
  /\b[689]\d{3}[\s.-]?\d{4}\b/g,
];

const NAME_LINE_PATTERNS = [
  /(?:or\s+)?call\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)\s*\+?\d/i,
  /chat\s+with\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s*$|[\d@])/i,
  /message\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s*$|[\d@])/i,
  /contact\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)\s*\+?\d/i,
  /customer[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s*$|[\d@])/i,
];

const NOISE_WORDS = new Set([
  'whatsapp', 'online', 'offline', 'typing', 'message', 'messages',
  'today', 'yesterday', 'am', 'pm', 'read', 'delivered', 'sent',
  'photo', 'video', 'audio', 'missed', 'contact', 'contacts',
  'search', 'new', 'chat', 'group', 'status', 'camera', 'gallery',
  'customer', 'order', 'grab', 'continue', 'note', 'mail',
]);

const NOISE_PHRASES = [
  /call your customer/i,
  /discuss how to edit/i,
  /conversation tips/i,
  /privacy laws/i,
  /original value/i,
  /keep your customer/i,
  /chef's favourite/i,
  /new order value/i,
];

function normalizePhone(raw) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 8 && /^[689]/.test(digits)) return `+65${digits}`;
  if (digits.length === 10 && digits.startsWith('65')) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return digits;
}

function formatPhoneDisplay(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('65') && digits.length === 10) {
    return `+65 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

function cleanName(raw) {
  return raw.replace(/[|@#*•·]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isNoiseName(name) {
  const trimmed = cleanName(name);
  if (!trimmed || trimmed.length < 2) return true;
  if (/\d/.test(trimmed)) return true;
  if (NOISE_PHRASES.some((p) => p.test(trimmed))) return true;
  const lower = trimmed.toLowerCase();
  if (NOISE_WORDS.has(lower)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return true;
  if (words.some((w) => NOISE_WORDS.has(w.toLowerCase()))) return true;
  return false;
}

function looksLikeName(line) {
  const trimmed = cleanName(line);
  if (isNoiseName(trimmed)) return false;
  if (/^[^a-zA-ZÀ-ÿ]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  return words.every((w) => /^[A-ZÀ-ÿ]/.test(w) || /^[a-zà-ÿ]{2,}$/.test(w));
}

function extractNameFromLine(line, phoneMatch) {
  for (const pattern of NAME_LINE_PATTERNS) {
    const m = line.match(pattern);
    if (m?.[1]) {
      const name = cleanName(m[1]);
      if (!isNoiseName(name)) return name;
    }
  }

  const beforePhone = line.split(phoneMatch)[0] ?? '';
  const stripped = beforePhone
    .replace(/^(?:or\s+)?call\s+/i, '')
    .replace(/^chat\s+with\s+/i, '')
    .replace(/^message\s+/i, '')
    .replace(/^contact\s+/i, '')
    .trim();

  if (looksLikeName(stripped)) return stripped;
  return '';
}

function findNameNearLine(lines, phoneLineIndex) {
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const idx = phoneLineIndex + offset;
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx].trim();

    for (const pattern of NAME_LINE_PATTERNS) {
      const m = line.match(pattern);
      if (m?.[1]) {
        const name = cleanName(m[1]);
        if (!isNoiseName(name)) return name;
      }
    }

    if (looksLikeName(line)) return line;
  }
  return '';
}

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Customer name from Grab order detail screen (no phone on that screen). */
function extractOrderDetailCustomerName(text) {
  const patterns = [
    /\d+\s*items?\s+for\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s*@|\s+Ads\b|\s+da\b|\s+new\b|\s*$)/i,
    /out for delivery[\s\S]{0,120}?for\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s*@|\s+Ads\b|\s+da\b|\s+new\b|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const name = cleanName(m[1]);
      if (!isNoiseName(name)) return name;
    }
  }
  return '';
}

export function parseContactsFromOcrText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullText = lines.join('\n');
  const found = [];
  const seenPhones = new Set();

  const fullTextPatterns = [
    /(?:or\s+)?call\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)\s*(\+65\s*\d{4}\s*\d{4})/gi,
    /chat\s+with\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]+?)(?:\s|$)/gi,
  ];

  for (const pattern of fullTextPatterns) {
    let m;
    while ((m = pattern.exec(fullText)) !== null) {
      const name = cleanName(m[1]);
      const phoneRaw = m[2] || '';
      if (isNoiseName(name)) continue;

      const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
      if (phone) {
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        found.push({
          id: uniqueId(),
          name,
          phone: formatPhoneDisplay(phone),
          sourceText: m[0],
          selected: true,
        });
      }
    }
  }

  lines.forEach((line, lineIndex) => {
    for (const pattern of PHONE_PATTERNS) {
      const matches = line.match(pattern);
      if (!matches) continue;

      for (const match of matches) {
        const phone = normalizePhone(match);
        const digitsOnly = phone.replace(/\D/g, '');
        if (digitsOnly.length < 8) continue;
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);

        let name = extractNameFromLine(line, match);
        if (!name) name = findNameNearLine(lines, lineIndex);

        found.push({
          id: uniqueId(),
          name: name || 'Unknown',
          phone: formatPhoneDisplay(phone),
          sourceText: line,
          selected: true,
        });
      }
    }
  });

  const detailName = extractOrderDetailCustomerName(fullText);
  if (detailName && !found.some((c) => namesMatchLoose(c.name, detailName))) {
    found.push({
      id: uniqueId(),
      name: detailName,
      phone: '',
      sourceText: detailName,
      selected: true,
    });
  }

  return found;
}

function namesMatchLoose(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

function vcardEscape(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function singleVCard(c) {
  const parts = c.name.split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  const first = parts.join(' ') || c.name;
  const phone = c.phone.replace(/\s/g, '');
  const uid = `${phone.replace(/\D/g, '')}-${c.id}@dolcesicilia.sg`;

  return [
    'BEGIN:VCARD',
    'VERSION:2.1',
    `UID:${uid}`,
    `N:${vcardEscape(last)};${vcardEscape(first)};;;`,
    `FN:${vcardEscape(c.name)}`,
    `TEL;CELL:${phone}`,
    `ORG:${vcardEscape(CUSTOMER_ORG)}`,
    `NOTE:${vcardEscape(CUSTOMER_TAG)}`,
    'END:VCARD',
  ].join('\r\n');
}

export function toVCard(contacts) {
  return contacts.map(singleVCard).join('\r\n\r\n');
}

export function toSingleVCard(contact) {
  return singleVCard(contact) + '\r\n';
}

export function isContactSelected(c) {
  return c.selected !== false;
}

export function getSelectedContacts(contacts) {
  return contacts.filter(isContactSelected);
}
