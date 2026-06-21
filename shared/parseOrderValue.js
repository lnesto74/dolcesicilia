/** Minimum SGD for a "high-value" first order (XL tray / big basket). */
export const HIGH_VALUE_THRESHOLD_SGD = 35;

function parseMoney(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function detectGrabScreenshotType(text) {
  if (!text?.trim()) return 'unknown';
  const isDetail =
    /out for delivery|booking id/i.test(text) &&
    (/subtotal/i.test(text) || /\btotal\b/i.test(text));
  if (isDetail) return 'order_detail';
  if (/discuss how to edit|call your customer|original value|can't exceed/i.test(text)) {
    return 'edit_call';
  }
  if (/subtotal/i.test(text) || /\btotal\s+S/i.test(text)) return 'order_detail';
  return 'unknown';
}

function findMoneyAfterLabel(text, label) {
  const chunk = text.match(new RegExp(`\\b${label}\\b[^\\n]{0,80}`, 'i'));
  if (!chunk) return null;
  const line = chunk[0];
  const patterns = [/S\$+\s*([\d,]+\.\d{2})/i, /([\d,]+\.\d{2})\s*$/];
  for (const re of patterns) {
    const m = line.match(re);
    if (m) {
      const v = parseMoney(m[1]);
      if (v) return v;
    }
  }
  return null;
}

function valueFromEditCap(text) {
  const capPatterns = [
    /can'?t exceed\s+S\$+\s*([\d,]+\.\d{2})/i,
    /can'?t exceed[\s\S]{0,40}?S\$+\s*([\d,]+\.\d{2})/i,
    /exceed\s+S\$+\s*([\d,]+\.\d{2})/i,
  ];
  let cap = null;
  for (const re of capPatterns) {
    const m = text.match(re);
    if (m) {
      cap = parseMoney(m[1]);
      if (cap) break;
    }
  }
  if (!cap) return null;

  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*of the original/i);
  const pct = pctMatch ? parseFloat(pctMatch[1]) / 100 : 0.2;
  const orderValue = Math.round((cap / (1 + pct)) * 100) / 100;

  return {
    orderValue,
    currency: 'SGD',
    source: 'edit_cap',
    raw: `cap S$${cap} / (1 + ${(pct * 100).toFixed(0)}%) = S$${orderValue}`,
    screenType: 'edit_call',
  };
}

function sumLineItems(text) {
  const lines = text.split(/\n/);
  let sum = 0;
  let found = 0;
  for (const line of lines) {
    if (/subtotal|discount|total|tax|delivery fee|booking/i.test(line)) continue;
    const qtyPrice = line.match(/(\d+)\s*x\s+.+?\s+([\d,]+\.\d{2})\s*$/i);
    if (qtyPrice) {
      const qty = parseInt(qtyPrice[1], 10);
      const unit = parseMoney(qtyPrice[2]);
      if (unit && qty > 0) {
        sum += unit * qty;
        found += 1;
        continue;
      }
    }
    const trailing = line.match(/([\d,]+\.\d{2})\s*$/);
    if (trailing && /\btiramis|portion|tray|classic|pistachio|orange|sharing|xl\b/i.test(line)) {
      const v = parseMoney(trailing[1]);
      if (v) {
        sum += v;
        found += 1;
      }
    }
  }
  return found > 0 ? Math.round(sum * 100) / 100 : null;
}

export function extractOrderValue(text) {
  if (!text?.trim()) return null;

  const screenType = detectGrabScreenshotType(text);
  const isNewCustomer = /\bnew\s+customer\b/i.test(text);

  const total = findMoneyAfterLabel(text, 'Total');
  if (total) {
    return {
      orderValue: total,
      currency: 'SGD',
      source: 'total',
      raw: `Total S$${total}`,
      isNewCustomer,
      screenType,
    };
  }

  const subtotal = findMoneyAfterLabel(text, 'Subtotal');
  if (subtotal) {
    return {
      orderValue: subtotal,
      currency: 'SGD',
      source: 'subtotal',
      raw: `Subtotal S$${subtotal}`,
      isNewCustomer,
      screenType,
    };
  }

  const items = sumLineItems(text);
  if (items) {
    return {
      orderValue: items,
      currency: 'SGD',
      source: 'items',
      raw: `Items S$${items}`,
      isNewCustomer,
      screenType,
    };
  }

  if (screenType === 'edit_call') {
    const fromCap = valueFromEditCap(text);
    if (fromCap) return { ...fromCap, isNewCustomer };
  }

  return null;
}

export function formatSgd(amount) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `S$${amount.toFixed(2)}`;
}

export function isHighValueOrder(value) {
  return value != null && value >= HIGH_VALUE_THRESHOLD_SGD;
}
