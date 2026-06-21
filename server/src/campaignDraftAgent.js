import { buildBusinessSnapshot } from './businessSnapshot.js';
import { memoryForPrompt } from './businessMemory.js';
import { normalizeCampaignDrafts } from './campaignDraftNormalize.js';
import { canSendMessageToContact } from './messagingContext.js';
import { isContactRecentlyMessaged, queueCustomMessages } from './db.js';
import { computeCustomerSegments } from '../../shared/customerSegments.js';
import { lucaVoiceForPrompt } from '../../shared/lucaVoice.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_CONTACTS_PER_SEGMENT = 12;

function isEligibleForDraft(contact, messagingById) {
  const profile = messagingById[contact.id];
  if (!profile) return true;
  if (profile.recentlyMessaged) return false;
  if (profile.messagePref === 'opt_out') return false;
  return true;
}

function buildDraftPrompt(snapshot, businessMemory, { segmentId } = {}) {
  const memoryBlock = businessMemory?.trim()
    ? `\n\nBUSINESS MEMORY:\n${businessMemory}\n`
    : '';

  const messagingById = Object.fromEntries(
    (snapshot.messaging?.contacts || []).map((m) => [m.contactId, m]),
  );

  let segments = snapshot.segments || [];
  if (segmentId) {
    segments = segments.filter((s) => s.id === segmentId);
  }

  const eligibleBySegment = segments
    .map((s) => ({
      segmentId: s.id,
      name: s.name,
      who: s.who,
      count: s.count,
      promoKeyword:
        snapshot.promoCampaigns?.find((p) => p.id === s.id || p.id?.includes(s.id))?.keyword ?? null,
      contacts: (s.contacts || [])
        .filter((c) => isEligibleForDraft(c, messagingById))
        .slice(0, MAX_CONTACTS_PER_SEGMENT)
        .map((c) => ({
          id: c.id,
          name: c.name,
          orderCount: c.orderCount,
          totalSpend: c.totalSpend,
          daysSinceOrder: c.daysSinceOrder,
          firstOrderValue: c.firstOrderValue,
          maxOrderValue: c.maxOrderValue,
          messagePref: c.messagePref,
        })),
    }))
    .filter((s) => s.contacts.length > 0);

  if (eligibleBySegment.length === 0) {
    return null;
  }

  return `${lucaVoiceForPrompt()}

Using the live customer data below, write **personalized** WhatsApp messages — one unique message per customer. Do NOT copy the static promo templates or use identical text for multiple people.

${memoryBlock}
Return ONLY valid JSON (no markdown fences):
{
  "summary": "1-2 sentences on what you drafted and why",
  "segmentDrafts": [
    {
      "segmentId": "win-back",
      "campaignId": "win-back",
      "rationale": "why this segment now",
      "messages": [
        { "contactId": "exact-id-from-data", "body": "Hey {{firstName}}! ... signed Luca 🇮🇹" }
      ]
    }
  ]
}

VOICE & FORMAT:
- Follow CHEF LUCA VOICE above strictly — every message must sound like Luca wrote it by hand
- Use {{firstName}} for personalization (required)
- Weave segment promo keyword naturally where relevant (ORANGE, TREAT, TRAY, VIP, YES) — never as a pasted template
- Keep each message under ~400 characters

RULES:
- Only use contact IDs from the data below — never invent IDs
- Only include contacts listed as eligible
- Draft ${segmentId ? 'this segment' : 'the 1–2 highest-impact segments'} with eligible customers
- Each message must be meaningfully different — true 1-to-1 personalization

PROMO CAMPAIGNS (reference — adapt, do not copy verbatim):
${JSON.stringify(snapshot.promoCampaigns || [], null, 2)}

SEGMENTS & ELIGIBLE CONTACTS:
${JSON.stringify(eligibleBySegment, null, 2)}`;
}

function parseAgentJson(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Add it to your Mac server environment (e.g. in .env or launchd plist).',
    );
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.55,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errBody.slice(0, 400)}`);
  }

  const body = await res.json();
  const text = body.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude');
  return { model, text };
}

/**
 * Ask Claude to draft personalized segment messages, normalize, and optionally queue.
 */
export async function generateCampaignDrafts(dataSources, { segmentId, autoQueue = false } = {}) {
  const snapshot = buildBusinessSnapshot(dataSources);
  const businessMemory = memoryForPrompt();
  const prompt = buildDraftPrompt(snapshot, businessMemory, { segmentId });

  if (!prompt) {
    return {
      model: null,
      generatedAt: snapshot.generatedAt,
      summary: 'No eligible contacts to draft for right now.',
      drafts: [],
      queueItems: [],
      queued: [],
      skipped: [],
      queuedCount: 0,
      parseError: false,
    };
  }

  const { model, text } = await callClaude(prompt);

  let raw;
  try {
    raw = parseAgentJson(text);
  } catch {
    return {
      model,
      generatedAt: snapshot.generatedAt,
      summary: 'Claude response could not be parsed — try again.',
      drafts: [],
      queueItems: [],
      queued: [],
      skipped: [],
      queuedCount: 0,
      parseError: true,
      rawAnalysis: text,
    };
  }

  const segments = computeCustomerSegments(dataSources.contacts || []);

  const normalized = normalizeCampaignDrafts(raw, {
    segments,
    contacts: dataSources.contacts || [],
    canSend: (contactId, opts) => canSendMessageToContact(contactId, opts),
    isRecentlyMessaged: (contactId) => isContactRecentlyMessaged(contactId),
  });

  let queued = [];
  let queueError = null;

  if (autoQueue && normalized.queueItems.length > 0) {
    try {
      const result = queueCustomMessages({
        items: normalized.queueItems.map((q) => ({
          contactId: q.contactId,
          body: q.messageBody,
          templateId: q.templateId,
          templateName: q.templateName,
        })),
        respectPending: true,
        respectMcpPending: true,
      });
      queued = result.queued;
      normalized.skipped.push(...(result.skipped || []));
    } catch (err) {
      queueError = err.message;
    }
  }

  return {
    model,
    generatedAt: snapshot.generatedAt,
    summary: normalized.summary || raw.summary || '',
    drafts: normalized.drafts,
    queueItems: normalized.queueItems,
    queued,
    skipped: normalized.skipped,
    queuedCount: queued.length,
    draftCount: normalized.queueItems.length,
    parseError: false,
    queueError,
    usedBusinessMemory: Boolean(businessMemory?.trim()),
  };
}

/** Stage server drafts to message_queue without re-calling Claude. Skips MCP-composed pending rows. */
export function stageCampaignDrafts(items) {
  if (!items?.length) throw new Error('items required');
  return queueCustomMessages({
    items: items.map((q) => ({
      contactId: q.contactId,
      body: q.messageBody ?? q.body,
      templateId: q.templateId,
      templateName: q.templateName,
    })),
    respectPending: true,
    respectMcpPending: true,
  });
}
