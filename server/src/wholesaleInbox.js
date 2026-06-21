import { findWholesaleLeadByPhone, recordWholesaleInbound } from './db.js';
import { phoneFromWhatsAppFrom } from './openwa.js';

export async function handleWholesaleInbound(from, body, messageType = 'chat') {
  const phone = await phoneFromWhatsAppFrom(from);
  const lead = phone ? findWholesaleLeadByPhone(phone) : null;
  if (!lead) return { handled: false };

  const text = String(body || '').trim();
  if (!text) return { handled: false, reason: 'empty_body' };

  const row = recordWholesaleInbound({ leadId: lead.id, body: text });
  console.log(
    'Webhook: wholesale inbound',
    lead.name,
    messageType,
    text.slice(0, 80),
  );
  return {
    handled: true,
    ok: true,
    wholesale: true,
    leadId: lead.id,
    leadName: lead.name,
    messageId: row.id,
    body: text,
  };
}
