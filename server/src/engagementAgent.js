import { buildBusinessSnapshot } from './businessSnapshot.js';
import { appendBusinessInsight, memoryForPrompt } from './businessMemory.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function buildPrompt(snapshot, businessMemory) {
  const memoryBlock = businessMemory?.trim()
    ? `\n\nBUSINESS MEMORY (learnings from past sessions — treat as ground truth for Dolce Sicilia):\n${businessMemory}\n`
    : '';

  return `You are a growth strategist for Dolce Sicilia, a Singapore tiramisù delivery business on Grab.

Analyze the JSON business snapshot below. Find patterns in orders, revenue trends, repeat behaviour, segments, and feedback scores.
Use BUSINESS MEMORY for continuity — do not contradict established learnings unless new data clearly overrides them.
${memoryBlock}
Return ONLY valid JSON (no markdown fences, no commentary) with this shape:
{
  "growthSummary": "2-3 sentences on how fast the business is growing",
  "growthRate": { "ordersPerWeekEstimate": number, "revenuePerWeekEstimate": number, "confidence": "low"|"medium"|"high" },
  "keyPatterns": ["pattern 1", "pattern 2", ...],
  "upsellOpportunities": [
    { "segment": "name", "who": "description", "offer": "what to sell", "messageAngle": "WhatsApp angle", "priority": "high"|"medium"|"low" }
  ],
  "crossSellOpportunities": [
    { "from": "product/segment", "to": "product", "who": "target customers", "messageAngle": "angle", "priority": "high"|"medium"|"low" }
  ],
  "priorityActions": [
    { "action": "specific next step", "why": "data reason", "timing": "when to do it" }
  ],
  "risks": ["risk or gap to watch"],
  "recommendedCampaigns": ["campaign id from promoCampaigns list, in priority order"]
}

OUTPUT LIMITS (mandatory — stay concise or JSON will be cut off):
- growthSummary: max 3 sentences
- keyPatterns: max 6 items, each max 1 sentence
- upsellOpportunities: max 4 items; crossSellOpportunities: max 3; priorityActions: max 5; risks: max 4
- who / offer / messageAngle / action / why: max 1–2 short sentences each — no bullet lists inside strings
- Do NOT enumerate every contact by name unless critical; use counts and segment labels

Be specific to this data. Reference segment sizes, AOV, repeat rate, peak times. Suggest tray upsell, orange liquor, pistachio, XL portions where relevant.

MESSAGING & FREQUENCY (mandatory — respect customer consent):
- Each contact has messagePref: every_launch | weekly | monthly | opt_out | unset (see snapshot.messaging).
- Never queue launch messages for opt_out or unset contacts.
- Honor weekly/monthly caps via lastLaunchSentAt and lastMessageSentAt in messaging.contacts.
- Global guardrail: skip anyone messaged in the last 7 days (recentlyMessaged or daysSinceLastMessage < 7).
- Use messaging.contacts[].recentOutbound for full send history with sentAt timestamps.
- Prefer sending preference poll to unset contacts before launch campaigns.
- NEVER send the same template ID or identical message body to a contact twice (check sentTemplateIds; use check_message_send before queueing).

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;
}

function stripMarkdownFence(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  return fence ? fence[1].trim() : trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/** Try to close truncated JSON when the model hits max_tokens mid-response. */
function salvageTruncatedJson(raw) {
  let s = raw.trim();
  if (!s.startsWith('{')) return null;

  // Drop an incomplete trailing string property
  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/s, '');
  s = s.replace(/,\s*"[^"]*":\s*[^",\]}]*$/s, '');
  s = s.replace(/,\s*$/s, '');

  const openBrackets = (s.match(/\[/g) || []).length - (s.match(/]/g) || []).length;
  const openBraces = (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
  if (openBrackets < 0 || openBraces < 0) return null;

  s += ']'.repeat(openBrackets) + '}'.repeat(openBraces);
  try {
    const parsed = JSON.parse(s);
    parsed._truncated = true;
    return parsed;
  } catch {
    return null;
  }
}

function parseAgentJson(text) {
  const raw = stripMarkdownFence(text);
  try {
    return JSON.parse(raw);
  } catch {
    const salvaged = salvageTruncatedJson(raw);
    if (salvaged) return salvaged;
    throw new Error('invalid_json');
  }
}

function persistStrategyLearnings(strategy) {
  if (!strategy || strategy.parseError) return;
  try {
    if (strategy.growthSummary) {
      appendBusinessInsight({
        text: `Growth: ${strategy.growthSummary}`,
        source: 'orders-page-ai',
        category: 'strategy',
      });
    }
    for (const p of (strategy.keyPatterns || []).slice(0, 3)) {
      appendBusinessInsight({
        text: p,
        source: 'orders-page-ai',
        category: 'insight',
      });
    }
  } catch {
    // non-fatal
  }
}

export async function generateEngagementStrategy(dataSources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Add it to your Mac server environment (e.g. in .env or launchd plist).',
    );
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const snapshot = buildBusinessSnapshot(dataSources);
  const businessMemory = memoryForPrompt();

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
      temperature: 0.4,
      messages: [{ role: 'user', content: buildPrompt(snapshot, businessMemory) }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errBody.slice(0, 400)}`);
  }

  const body = await res.json();
  const text = body.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude');

  let strategy;
  let parseWarning = null;
  try {
    strategy = parseAgentJson(text);
    if (strategy._truncated) {
      parseWarning = 'Response was truncated — showing partial analysis. Run again for a full report.';
      delete strategy._truncated;
    }
  } catch {
    strategy = { rawAnalysis: text.slice(0, 800), parseError: true };
  }

  persistStrategyLearnings(strategy);

  return {
    model,
    generatedAt: snapshot.generatedAt,
    snapshot,
    strategy,
    parseWarning,
    usedBusinessMemory: Boolean(businessMemory?.trim()),
  };
}
