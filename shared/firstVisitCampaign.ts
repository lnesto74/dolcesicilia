export const FIRST_VISIT_CAMPAIGN_ID = 'first-visit-feedback';

/** Italy — closest widely-supported emoji for Sicilian identity in WhatsApp */
export const SICILY_ICON = '🇮🇹';

export type CampaignStep =
  | 'ready_msg1'
  | 'msg1_sent'
  | 'q1_sent'
  | 'q2_sent'
  | 'q3_sent'
  | 'review_sent'
  | 'completed';

export interface CampaignPoll {
  question: string;
  options: string[];
}

export interface CampaignMessage {
  step: CampaignStep;
  nextStep: CampaignStep | 'completed';
  label: string;
  body: string;
  poll?: CampaignPoll;
  waitForReply?: 'q1' | 'q2' | 'q3' | 'done';
}

export const GRAB_REVIEW_URL = 'https://r.grab.com/o/nyAbmuau';

const OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'] as const;

export function formatNumberedQuestion(header: string, options: string[]): string {
  return [header, ...options.map((o, i) => `${OPTION_EMOJIS[i]} ${o}`)].join('\n');
}

export const FIRST_VISIT_MESSAGES: CampaignMessage[] = [
  {
    step: 'ready_msg1',
    nextStep: 'msg1_sent',
    label: 'Message 1 — Welcome (1–2h after delivery)',
    body: `Ciao {{customerName}}! 🎉 This is {{senderName}} from Dolce Sicilia.
Thank you so much for your first order — it truly means the world to us. We hope every spoonful brought a little bit of Sicily to your table. ${SICILY_ICON}
We're a small artisan team and we're always working to do better. Would you answer 3 quick questions? Just reply with a number — takes 30 seconds.
And as a thank you… there's a little surprise waiting at the end 👀`,
  },
  {
    step: 'msg1_sent',
    nextStep: 'q1_sent',
    label: 'Message 2 — Q1: Tiramisù',
    waitForReply: 'q1',
    body: formatNumberedQuestion('1/3 — How was the tiramisù?', [
      'Absolutely loved it',
      'Really good',
      'It was okay',
      'Not quite what I expected',
    ]),
    poll: {
      question: '1/3 — How was the tiramisù?',
      options: [
        'Absolutely loved it',
        'Really good',
        'It was okay',
        'Not quite what I expected',
      ],
    },
  },
  {
    step: 'q1_sent',
    nextStep: 'q2_sent',
    label: 'Message 3 — Q2: Delivery',
    waitForReply: 'q2',
    body: formatNumberedQuestion('2/3 — How was the delivery and packaging?', [
      'Perfect — arrived fresh and well packed',
      'Good, no complaints',
      'Packaging could be better',
      'There was an issue',
    ]),
    poll: {
      question: '2/3 — How was the delivery and packaging?',
      options: [
        'Perfect — arrived fresh and well packed',
        'Good, no complaints',
        'Packaging could be better',
        'There was an issue',
      ],
    },
  },
  {
    step: 'q2_sent',
    nextStep: 'q3_sent',
    label: 'Message 4 — Q3: Recommend',
    waitForReply: 'q3',
    body: formatNumberedQuestion('3/3 — Would you order again or recommend us?', [
      '100% — already thinking about my next order',
      "Yes, I'd recommend you",
      'Maybe, depends on the occasion',
      'Probably not',
    ]),
    poll: {
      question: '3/3 — Would you order again or recommend us?',
      options: [
        '100% — already thinking about my next order',
        "Yes, I'd recommend you",
        'Maybe, depends on the occasion',
        'Probably not',
      ],
    },
  },
  {
    step: 'q3_sent',
    nextStep: 'review_sent',
    label: 'Message 5 — Grab review request',
    waitForReply: 'done',
    body: `Grazie mille, you're a star! 🌟
Your reward is almost unlocked — one last step:
Leave us a quick review on Grab ⭐⭐⭐⭐⭐ (30 seconds, means everything to a small business like ours):
👉 ${GRAB_REVIEW_URL}
Once you've done it, just reply "done" and I'll activate your gift 🎁`,
  },
  {
    step: 'review_sent',
    nextStep: 'completed',
    label: 'Message 6 — Reward unlocked',
    body: `🎉 You unlocked it!
On your next order of any Dolce Sicilia tray, we'll add a free monoportion of your choice — Classic, Pistachio or Orange Liquor.
Just mention this message when you order and we'll take care of the rest. No expiry, no catch. 🇮🇹
See you next time — The Dolce Sicilia team`,
  },
];

export function getMessageForStep(step: CampaignStep): CampaignMessage | undefined {
  if (step === 'completed') return undefined;
  if (step === 'ready_msg1') return FIRST_VISIT_MESSAGES[0];
  return FIRST_VISIT_MESSAGES.find((m) => m.step === step);
}

export function getPollOptions(step: CampaignStep): string[] | null {
  const msg = getMessageForStep(step);
  return msg?.poll?.options ?? null;
}

/** Interactive options we are waiting for live on the prior sent step */
const WAITING_POLL_STEP: Record<string, CampaignStep> = {
  q1: 'msg1_sent',
  q2: 'q1_sent',
  q3: 'q2_sent',
  done: 'q3_sent',
};

export function getPollOptionsForWaiting(waitingFor: string | null): string[] | null {
  if (!waitingFor) return null;
  const step = WAITING_POLL_STEP[waitingFor];
  return step ? getPollOptions(step) : null;
}

export function answerLabelFor(replyKey: string, value: string): string {
  if (replyKey === 'done') return 'Grab review completed';
  const step = WAITING_POLL_STEP[replyKey];
  const opts = step ? getPollOptions(step) : null;
  if (!opts) return value;
  const idx = parseInt(value, 10) - 1;
  return opts[idx] || value;
}

export function parseCampaignReply(
  body: string,
  waitingFor: string | null,
  pollOptions: string[] | null,
): { value: string; label: string } | null {
  const trimmed = String(body || '').trim();
  const lower = trimmed.toLowerCase();
  if (!waitingFor) return null;

  if (waitingFor === 'done') {
    if (
      /^(done|fatto|yes|ok|review)/i.test(lower) ||
      /left my review|review ✅|activate your gift/i.test(lower)
    ) {
      return { value: 'done', label: trimmed || 'done' };
    }
  }

  if (pollOptions?.length) {
    for (let i = 0; i < pollOptions.length; i++) {
      const opt = pollOptions[i].toLowerCase();
      if (lower === opt || lower.includes(opt.slice(0, 10)) || opt.includes(lower.slice(0, 10))) {
        return { value: String(i + 1), label: pollOptions[i] };
      }
    }
  }

  const digit = lower.match(/^[1-4]/);
  if (digit) {
    const idx = parseInt(digit[0], 10) - 1;
    return { value: digit[0], label: pollOptions?.[idx] || digit[0] };
  }

  return null;
}

/** Normalize stored answer (legacy string or { value, label }) */
export function formatStoredAnswer(raw: unknown): { value: string; label: string } | null {
  if (!raw) return null;
  if (typeof raw === 'string') return { value: raw, label: raw };
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const a = raw as { value: string; label?: string };
    return { value: a.value, label: a.label || a.value };
  }
  return null;
}

export function firstNameFromFullName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'Unknown') return 'there';
  return trimmed.split(/\s+/)[0];
}

export function fillCampaignMessage(body: string, customerName: string, senderName = 'Luca'): string {
  const customerFirst = firstNameFromFullName(customerName);
  return body
    .replace(/\{\{customerName\}\}/g, customerFirst)
    .replace(/\{\{senderName\}\}/g, senderName)
    .replace(/\{\{firstName\}\}/g, customerFirst)
    .replace(/\{\{name\}\}/g, customerName);
}

export function stepLabel(step: CampaignStep): string {
  const msg = getMessageForStep(step);
  return msg?.label ?? step;
}
