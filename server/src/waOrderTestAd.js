import { listContacts, logWhatsAppInteraction } from './db.js';
import { buildFacebookAdWhatsAppMessage } from '../../shared/waOrderOutreach.js';
import { openwaConfig, sendTextMessage, ensureWhatsAppReady } from './openwa.js';

export function findLucaTestContact() {
  return listContacts().find((c) => /^luca$/i.test(String(c.name || '').trim())) || null;
}

/** Send standard Meta ad copy to Luca — skips campaign dedup (repeatable test). */
export async function sendWaOrderTestAdToLuca() {
  const luca = findLucaTestContact();
  if (!luca) return { ok: false, error: 'Luca test contact not found in CRM' };

  const cfg = openwaConfig();
  if (!cfg.enabled) return { ok: false, error: 'OpenWA must be enabled' };

  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return { ok: false, error: ready.error };

  const messageBody = buildFacebookAdWhatsAppMessage();
  try {
    await sendTextMessage(luca.phone, messageBody);
  } catch (err) {
    return {
      ok: false,
      error: `WhatsApp could not send to ${luca.name}: ${err.message}`,
      phone: luca.phone,
    };
  }

  logWhatsAppInteraction({
    contactId: luca.id,
    phone: luca.phone,
    direction: 'out',
    messageType: 'text',
    body: messageBody.slice(0, 500),
  });

  return {
    ok: true,
    contactId: luca.id,
    name: luca.name,
    phone: luca.phone,
    messageBody,
    sentViaOpenwa: true,
  };
}
