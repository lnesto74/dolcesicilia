#!/usr/bin/env node
/**
 * Dolce Sicilia MCP server — connect Claude Desktop to live customer/order data.
 * Stdio transport for Claude Desktop / Cursor MCP clients.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  appendBusinessInsight,
  readBusinessMemory,
  BUSINESS_MEMORY_PATH,
} from '../src/businessMemory.js';
import { buildBusinessSnapshot } from '../src/businessSnapshot.js';
import { buildMessagingContext, canSendMessageToContact } from '../src/messagingContext.js';
import {
  listAllOrders,
  listContactsWithMessages,
  listCampaignResults,
  getSetting,
  listMessageTemplates,
  saveMessageTemplate,
  queueCustomMessages,
  listMessageQueue,
  listEndOfDayAudience,
  listWholesaleLeads,
  saveWholesaleLead,
  updateWholesaleLeadStatus,
  listWholesaleQueue,
  listWholesaleInbox,
  DB_PATH,
} from '../src/db.js';
import { queueWholesaleMessages, checkWholesaleSend } from '../src/wholesaleQueue.js';
import { computeOrderAnalytics } from '../../shared/orderAnalytics.js';
import { computeCustomerSegments } from '../../shared/customerSegments.js';
import { computeCampaignAnalytics } from '../../shared/campaignAnalytics.js';
import { generateCampaignDrafts } from '../src/campaignDraftAgent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_BUILD = fs.statSync(fileURLToPath(import.meta.url)).mtime.toISOString();

// Load server/.env for any future API tools
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function jsonText(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function liveData() {
  const orders = listAllOrders();
  const contacts = listContactsWithMessages();
  const campaignResults = listCampaignResults();
  return { orders, contacts, campaignResults };
}

const server = new McpServer({
  name: 'dolcesicilia',
  version: '1.0.0',
});

server.tool(
  'get_order_analytics',
  'Live order & revenue analytics from Dolce Sicilia (Grab screenshots, SQLite).',
  {},
  async () => {
    const { orders } = liveData();
    return jsonText(computeOrderAnalytics(orders));
  },
);

server.tool(
  'get_customer_segments',
  'Promo segments: win-back, tray upsell, VIP, high-value first order, top spenders — with customer lists.',
  {
    segmentId: z
      .string()
      .optional()
      .describe('Optional segment id: win-back, tray-upsell, vip, high-value-first, top-spender'),
  },
  async ({ segmentId }) => {
    const { contacts } = liveData();
    const segments = computeCustomerSegments(contacts);
    if (segmentId) {
      const match = segments.find((s) => s.id === segmentId);
      if (!match) {
        return jsonText({
          error: `Unknown segment "${segmentId}"`,
          available: segments.map((s) => ({ id: s.id, name: s.name, count: s.contacts.length })),
        });
      }
      return jsonText(match);
    }
    return jsonText(
      segments.map((s) => ({
        id: s.id,
        name: s.name,
        who: s.who,
        count: s.contacts.length,
        sample: s.contacts.slice(0, 3).map((c) => c.name),
      })),
    );
  },
);

server.tool(
  'get_campaign_feedback',
  'First-visit WhatsApp campaign results and satisfaction scores.',
  {},
  async () => {
    const results = listCampaignResults();
    return jsonText({
      results: results.slice(0, 30),
      analytics: computeCampaignAnalytics(results),
    });
  },
);

server.tool(
  'get_business_memory',
  'Shared Dolce Sicilia learnings file — persists across website AI and Claude Desktop.',
  {},
  async () => {
    const mem = readBusinessMemory();
    return {
      content: [
        {
          type: 'text',
          text: mem.raw,
        },
      ],
    };
  },
);

server.tool(
  'save_business_insight',
  'Append a learning to business-memory.md (shared with website AI). Use after discovering a pattern or deciding a strategy.',
  {
    insight: z.string().describe('What to remember — be specific to Dolce Sicilia'),
    category: z
      .enum(['insight', 'strategy', 'campaign', 'product', 'customer'])
      .optional()
      .describe('Category tag'),
  },
  async ({ insight, category }) => {
    const result = appendBusinessInsight({
      text: insight,
      source: 'claude-desktop',
      category: category || 'insight',
    });
    return jsonText({ ok: true, ...result, file: BUSINESS_MEMORY_PATH });
  },
);

server.tool(
  'get_recent_strategies',
  'Last engagement strategy generated from the Orders page AI agent.',
  {},
  async () => {
    const raw = getSetting('last_engagement_strategy', '');
    if (!raw) {
      return jsonText({ strategy: null, hint: 'Run analysis on Orders page first, or use get_full_snapshot in Desktop.' });
    }
    try {
      return jsonText(JSON.parse(raw));
    } catch {
      return jsonText({ strategy: null, raw });
    }
  },
);

server.tool(
  'check_message_send',
  'Check whether a message can be sent to a contact without duplicating a prior send. Always call before queue_custom_message.',
  {
    contactId: z.string().describe('Contact id'),
    body: z.string().describe('Message body (filled or with {{firstName}} — will compare filled form if contact known)'),
    templateId: z.string().optional().describe('Template id if using a saved template'),
  },
  async ({ contactId, body, templateId }) => {
    const contact = listContactsWithMessages().find((c) => c.id === contactId);
    if (!contact) return jsonText({ allowed: false, error: 'Contact not found' });
    const { fillTemplate } = await import('../../shared/messageTemplates.js');
    const filled = fillTemplate(body, contact.name);
    const result = canSendMessageToContact(contactId, { body: filled, templateId });
    return jsonText({
      contactId,
      contactName: contact.name,
      ...result,
      sentTemplateIds: contact.sentLogSummary?.map((l) => l.template_id).filter(Boolean) || [],
    });
  },
);

server.tool(
  'get_messaging_context',
  'WhatsApp message preferences, send timestamps, and launch eligibility per contact. Use before queueing any campaign so Claude respects frequency and opt-in.',
  {
    contactId: z.string().optional().describe('Optional contact id — omit for all contacts'),
    onlyEligibleForLaunch: z
      .boolean()
      .optional()
      .describe('If true, return only contacts eligible for a launch campaign right now'),
  },
  async ({ contactId, onlyEligibleForLaunch }) => {
    const { contacts } = liveData();
    let ctx = buildMessagingContext(contacts);
    if (contactId) {
      const match = ctx.contacts.find((c) => c.contactId === contactId);
      if (!match) {
        return jsonText({ error: `Unknown contact "${contactId}"` });
      }
      ctx = { ...ctx, contacts: [match] };
    } else if (onlyEligibleForLaunch) {
      ctx = {
        ...ctx,
        contacts: ctx.contacts.filter((c) => c.eligibleForLaunchCampaign),
      };
    }
    return jsonText(ctx);
  },
);

server.tool(
  'get_full_snapshot',
  'Complete business snapshot: orders, segments, campaigns, trends — best starting point for strategy chat.',
  {},
  async () => {
    const data = liveData();
    const snapshot = buildBusinessSnapshot(data);
    const memory = readBusinessMemory();
    return jsonText({
      snapshot,
      businessMemory: memory.learnings || '(no learnings yet)',
    });
  },
);

server.tool(
  'save_message_template',
  'Save a WhatsApp message template to the Dolce Sicilia Messages page (/customers/messages).',
  {
    name: z.string().describe('Template display name'),
    description: z.string().describe('Short description shown in the template picker'),
    body: z.string().describe('Message body; use {{firstName}} for personalization'),
    targetSegment: z
      .string()
      .optional()
      .describe('Optional audience segment id: vip, win-back, tray-upsell, high-value-first, top-spender'),
  },
  async ({ name, description, body, targetSegment }) => {
    try {
      const template = saveMessageTemplate({ name, description, body, targetSegment });
      return jsonText({
        ok: true,
        template,
        totalTemplates: listMessageTemplates().length,
      });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'draft_personalized_campaigns',
  'Fallback auto-draft via server lucaVoice (not Desktop skills). Preview only — stage via website or queue_personalized_messages; never overwrites pending queue rows.',
  {
    segmentId: z
      .string()
      .optional()
      .describe(
        'Optional: draft only this segment (win-back, tray-upsell, vip, high-value-first, top-spender, new-nurture). Omit to let Claude pick top 1–2 segments.',
      ),
  },
  async ({ segmentId }) => {
    try {
      const data = liveData();
      const result = await generateCampaignDrafts(data, { segmentId, autoQueue: false });
      return jsonText({
        ok: true,
        summary: result.summary,
        queuedCount: result.queuedCount,
        draftCount: result.draftCount,
        mcpSkipped: (result.skipped || []).filter((s) => s.reason === 'mcp_pending'),
        drafts: result.drafts?.map((d) => ({
          segmentId: d.segmentId,
          segmentName: d.segmentName,
          rationale: d.rationale,
          messageCount: d.messages.length,
          sample: d.messages.slice(0, 2).map((m) => ({
            contactName: m.contactName,
            bodyPreview: m.body.slice(0, 120),
          })),
        })),
        skipped: result.skipped?.slice(0, 20),
        queueError: result.queueError || null,
        hint: 'Review and send at /customers/messages — messages appear in the Send column grouped by variant.',
      });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'queue_custom_message',
  'Queue a custom WhatsApp message for specific customers — pre-selects them on /customers/messages. For segment-based personalized drafts from live data, prefer draft_personalized_campaigns.',
  {
    contactIds: z
      .array(z.string())
      .describe('Contact IDs from get_customer_segments or the contacts list'),
    body: z.string().describe('Message body; use {{firstName}} for personalization'),
  },
  async ({ contactIds, body }) => {
    try {
      const result = queueCustomMessages({ contactIds, body, respectPending: true, respectMcpPending: true });
      return jsonText({
        ok: true,
        ...result,
        count: result.queued.length,
        pendingTotal: listMessageQueue().length,
        hint: 'Call check_message_send per contact first. Duplicates are blocked automatically.',
      });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'queue_personalized_messages',
  'Queue tailored 1-to-1 WhatsApp messages (different body per customer). Skips anyone messaged in the last 7 days.',
  {
    items: z
      .array(
        z.object({
          contactId: z.string(),
          body: z.string().describe('Personalised message for this customer; {{firstName}} supported'),
          templateId: z
            .string()
            .optional()
            .describe('Optional tag, e.g. claude:win-back — shown in Messages UI and message_log'),
          templateName: z
            .string()
            .optional()
            .describe('Optional label, e.g. "Composed by Claude" or segment name'),
        }),
      )
      .describe('One entry per customer with their own message'),
  },
  async ({ items }) => {
    try {
      const result = queueCustomMessages({
        items: items.map((i) => ({
          contactId: i.contactId,
          body: i.body,
          templateId: i.templateId ?? null,
          templateName: i.templateName ?? (i.templateId?.startsWith('claude:') ? 'Composed by Claude' : null),
        })),
        respectPending: true,
      });
      return jsonText({
        ok: true,
        ...result,
        count: result.queued.length,
        pendingTotal: listMessageQueue().length,
      });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'get_end_of_day_audience',
  'Contacts with endOfDayOptin who can receive leftover-tray alerts (respects 7-day dedup).',
  {
    minDaysBetween: z.number().optional().describe('Min days since any message (default 7)'),
  },
  async ({ minDaysBetween = 7 }) => {
    const audience = listEndOfDayAudience(minDaysBetween);
    return jsonText({
      count: audience.length,
      contacts: audience.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        messagePref: c.message_pref,
        endOfDayOptin: !!c.end_of_day_optin,
      })),
    });
  },
);

server.tool(
  'queue_end_of_day_messages',
  'Queue a message for contacts who opted into end-of-day tray alerts. Uses message_queue (same dedup/cap rules).',
  {
    messageBody: z.string().describe('Tray alert text — use {{firstName}} for personalization'),
    minDaysBetween: z.number().optional().describe('Min days since any message (default 7)'),
    contactIds: z.array(z.string()).optional().describe('Optional subset of end-of-day audience'),
  },
  async ({ messageBody, minDaysBetween = 7, contactIds }) => {
    try {
      let audience = listEndOfDayAudience(minDaysBetween);
      if (contactIds?.length) {
        const idSet = new Set(contactIds);
        audience = audience.filter((c) => idSet.has(c.id));
      }
      if (audience.length === 0) {
        return jsonText({ ok: false, error: 'No eligible end-of-day contacts' });
      }
      const result = queueCustomMessages({
        items: audience.map((c) => ({
          contactId: c.id,
          body: messageBody,
          templateId: 'end-of-day-tray',
          templateName: 'End-of-day tray',
        })),
        minDaysBetween,
      });
      return jsonText({ ok: true, audienceCount: audience.length, ...result });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'get_wholesale_leads',
  'List B2B wholesale café leads — filterable by zone and pipeline status.',
  {
    zone: z.string().optional().describe('Zone name, e.g. Tanjong Pagar/CBD'),
    status: z
      .enum(['new', 'contacted', 'replied', 'sampling', 'won', 'declined'])
      .optional()
      .describe('Pipeline status filter'),
  },
  async ({ zone, status }) => {
    const leads = listWholesaleLeads({ zone, status });
    return jsonText({ count: leads.length, leads });
  },
);

server.tool(
  'save_wholesale_lead',
  'Create or update a wholesale café lead (upsert by id). Forwards all contact/location fields.',
  {
    id: z.string().optional().describe('Lead id — omit to auto-generate on create'),
    name: z.string().describe('Business name'),
    type: z.string().optional().describe('Business type, e.g. specialty roaster'),
    zone: z.string().optional().describe('Geographic zone, e.g. Tanjong Pagar/CBD'),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    instagram: z.string().optional(),
    website: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    fit_note: z.string().optional().describe('Why this lead is a good fit'),
    priority: z.number().optional().describe('Lower = warmer (1 is best)'),
    status: z
      .enum(['new', 'contacted', 'replied', 'sampling', 'won', 'declined'])
      .optional(),
  },
  async (fields) => {
    try {
      const lead = saveWholesaleLead(fields);
      return jsonText({ ok: true, lead, totalLeads: listWholesaleLeads().length });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'update_wholesale_status',
  'Move a wholesale lead along the B2B pipeline.',
  {
    leadId: z.string().describe('Lead id from get_wholesale_leads'),
    status: z.enum(['new', 'contacted', 'replied', 'sampling', 'won', 'declined']),
  },
  async ({ leadId, status }) => {
    try {
      const lead = updateWholesaleLeadStatus(leadId, status);
      return jsonText({ ok: true, lead });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'queue_wholesale_message',
  'Queue B2B outreach messages for wholesale leads. Skips 14-day frequency cap and exact duplicate bodies.',
  {
    items: z
      .array(
        z.object({
          leadId: z.string(),
          body: z.string().describe('Personalised B2B proposal for this café'),
        }),
      )
      .describe('One entry per lead with their own message'),
    minDaysBetween: z
      .number()
      .optional()
      .describe('Min days since last contact (default 14)'),
  },
  async ({ items, minDaysBetween = 14 }) => {
    try {
      const result = queueWholesaleMessages({ items, minDaysBetween });
      return jsonText({
        ok: true,
        ...result,
        count: result.queued.length,
        pendingTotal: listWholesaleQueue().length,
        hint: 'Review and send at /customers/wholesale — Luca clicks Send via OpenWA.',
      });
    } catch (err) {
      return jsonText({ ok: false, error: err.message });
    }
  },
);

server.tool(
  'check_wholesale_send',
  'Check whether a wholesale message can be sent without duplicating a prior send or breaking the 14-day cap.',
  {
    leadId: z.string().describe('Lead id'),
    body: z.string().describe('Message body to check'),
    minDaysBetween: z.number().optional().describe('Min days since last contact (default 14)'),
  },
  async ({ leadId, body, minDaysBetween = 14 }) => {
    return jsonText(checkWholesaleSend(leadId, body, minDaysBetween));
  },
);

server.tool(
  'get_wholesale_inbox',
  'Inbound WhatsApp replies from wholesale café leads — read answers and draft follow-ups.',
  {
    since: z
      .string()
      .optional()
      .describe('Only messages on or after this time (SQLite datetime or ISO)'),
    unreadOnly: z
      .boolean()
      .optional()
      .describe('If true, return only inbound messages not yet marked read'),
  },
  async ({ since, unreadOnly }) => {
    const messages = listWholesaleInbox({ since, unreadOnly });
    return jsonText({
      count: messages.length,
      messages,
      hint: 'Use update_wholesale_status and queue_wholesale_message for follow-ups.',
    });
  },
);

server.resource(
  'business-memory',
  'dolcesicilia://business-memory',
  { mimeType: 'text/markdown', description: 'Shared Dolce Sicilia business learnings' },
  async () => ({
    contents: [
      {
        uri: 'dolcesicilia://business-memory',
        mimeType: 'text/markdown',
        text: readBusinessMemory().raw,
      },
    ],
  }),
);

server.resource(
  'messaging-context',
  'dolcesicilia://messaging',
  {
    mimeType: 'application/json',
    description: 'Per-contact WhatsApp prefs, send timestamps, launch eligibility',
  },
  async () => {
    const { contacts } = liveData();
    const ctx = buildMessagingContext(contacts);
    return {
      contents: [
        {
          uri: 'dolcesicilia://messaging',
          mimeType: 'application/json',
          text: JSON.stringify(ctx, null, 2),
        },
      ],
    };
  },
);

server.resource(
  'live-snapshot',
  'dolcesicilia://snapshot',
  { mimeType: 'application/json', description: 'Live order & customer snapshot' },
  async () => {
    const data = liveData();
    const snapshot = buildBusinessSnapshot(data);
    return {
      contents: [
        {
          uri: 'dolcesicilia://snapshot',
          mimeType: 'application/json',
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const wholesaleTools = [
    'get_wholesale_leads',
    'check_wholesale_send',
    'queue_wholesale_message',
    'update_wholesale_status',
    'get_wholesale_inbox',
    'save_wholesale_lead',
  ];
  console.error('[mcp] dolcesicilia connector build', process.env.DOLCE_MCP_BUILD || MCP_BUILD);
  console.error('[mcp] index', fileURLToPath(import.meta.url));
  console.error('[db] MCP using', DB_PATH);
  console.error('[mcp] wholesale tools:', wholesaleTools.join(', '));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Dolce Sicilia MCP server running (stdio)');
}

main().catch((err) => {
  console.error('MCP server failed:', err);
  process.exit(1);
});
