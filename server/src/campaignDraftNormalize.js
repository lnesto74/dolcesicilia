import { fillTemplate } from '../../shared/messageTemplates.js';
import { PROMO_CAMPAIGNS } from '../../shared/customerSegments.js';
import { duplicateSkipReason } from '../../shared/messageDedup.js';

const VALID_SEGMENT_IDS = new Set([
  'win-back',
  'high-value-first',
  'vip',
  'tray-upsell',
  'top-spender',
  'new-nurture',
]);

/** Trim body, strip fences, ensure {{firstName}} placeholder exists. */
export function normalizeMessageBody(body, contactName) {
  if (!body || typeof body !== 'string') return '';
  let text = body.trim();
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.includes('{{firstName}}') && !text.includes('{{name}}')) {
    const first = contactName?.split(/\s+/)[0] || 'there';
    if (!text.toLowerCase().startsWith('hey') && !text.toLowerCase().startsWith('ciao')) {
      text = `Hey {{firstName}}! ${text}`;
    } else {
      text = text.replace(/^(hey|ciao)\s+/i, (m) => `${m}{{firstName}}, `);
      if (!text.includes('{{firstName}}')) {
        text = `Hey {{firstName}}! ${text}`;
      }
    }
    void first;
  }
  // Claude sometimes writes "Ciao {{firstName}}, Alpana" — drop the duplicate hardcoded name
  const first = (contactName?.split(/\s+/)[0] || '').trim();
  if (first) {
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(
      new RegExp(`(\\{\\{firstName\\}\\}),?\\s+${esc}\\b`, 'gi'),
      '{{firstName}}',
    );
    text = text.replace(
      new RegExp(`^(ciao|hey)\\s+${esc}\\b,?\\s*`, 'i'),
      (m) => `${m.split(/\s+/)[0]} {{firstName}}, `,
    );
  }
  return text.replace(/\{\{name\}\}/gi, '{{firstName}}');
}

function promoForSegment(segmentId) {
  return PROMO_CAMPAIGNS.find((c) => c.segmentId === segmentId || c.id === segmentId) ?? null;
}

/**
 * Turn raw Claude JSON into validated, send-ready draft groups per segment.
 * @param {object} raw - Claude response with segmentDrafts[]
 * @param {object} ctx
 * @param {import('../../shared/customerSegments.js').CustomerSegment[]} ctx.segments
 * @param {object[]} ctx.contacts - full contact rows
 * @param {(contactId: string, opts: { body: string, templateId?: string }) => { allowed: boolean, duplicate?: object }} ctx.canSend
 * @param {(contactId: string, minDays?: number) => boolean} ctx.isRecentlyMessaged
 */
export function normalizeCampaignDrafts(raw, { segments, contacts, canSend, isRecentlyMessaged }) {
  const segmentById = Object.fromEntries(segments.map((s) => [s.id, s]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const drafts = [];
  const allSkipped = [];

  for (const draft of raw?.segmentDrafts || []) {
    const segmentId = String(draft.segmentId || '').trim();
    if (!VALID_SEGMENT_IDS.has(segmentId)) {
      allSkipped.push({ segmentId, reason: 'unknown_segment' });
      continue;
    }
    const segment = segmentById[segmentId];
    if (!segment) {
      allSkipped.push({ segmentId, reason: 'segment_empty' });
      continue;
    }

    const promo = promoForSegment(segmentId);
    const campaignId = draft.campaignId || promo?.id || segmentId;
    const segmentContactIds = new Set(segment.contacts.map((c) => c.id));
    const messages = [];
    const skipped = [];

    for (const msg of draft.messages || []) {
      const contactId = String(msg.contactId || '').trim();
      const contact = contactById[contactId];
      if (!contact) {
        skipped.push({ contactId, segmentId, reason: 'contact_not_found' });
        continue;
      }
      if (!segmentContactIds.has(contactId)) {
        skipped.push({ contactId, contactName: contact.name, segmentId, reason: 'not_in_segment' });
        continue;
      }
      const body = normalizeMessageBody(msg.body, contact.name);
      if (!body) {
        skipped.push({ contactId, contactName: contact.name, segmentId, reason: 'empty_body' });
        continue;
      }
      if (isRecentlyMessaged(contactId)) {
        skipped.push({ contactId, contactName: contact.name, segmentId, reason: 'recent_message' });
        continue;
      }
      const templateId = `claude:${campaignId}`;
      const filled = fillTemplate(body, contact.name);
      const gate = canSend(contactId, { body: filled, templateId });
      if (!gate.allowed) {
        skipped.push({
          contactId,
          contactName: contact.name,
          segmentId,
          reason: 'duplicate_message',
          detail: gate.duplicate ? duplicateSkipReason(gate.duplicate) : 'duplicate',
        });
        continue;
      }
      messages.push({
        contactId,
        contactName: contact.name,
        body,
        segmentId,
        segmentName: segment.name,
        campaignId,
        templateId,
        templateName: `Claude · ${segment.name}`,
      });
    }

    allSkipped.push(...skipped);
    if (messages.length > 0) {
      drafts.push({
        segmentId,
        segmentName: segment.name,
        campaignId,
        promoKeyword: promo?.keyword ?? null,
        rationale: draft.rationale || '',
        messages,
        skipped,
      });
    }
  }

  const queueItems = drafts.flatMap((d) =>
    d.messages.map((m) => ({
      contactId: m.contactId,
      contactName: m.contactName,
      messageBody: m.body,
      templateId: m.templateId,
      templateName: m.templateName,
      segmentId: m.segmentId,
      segmentName: m.segmentName,
    })),
  );

  return {
    summary: raw?.summary || '',
    drafts,
    queueItems,
    skipped: allSkipped,
    queuedCount: queueItems.length,
  };
}
