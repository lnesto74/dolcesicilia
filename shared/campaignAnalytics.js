import { answerLabelFor, formatStoredAnswer } from './firstVisitCampaign.js';

export const QUESTION_META = {
  q1: {
    title: 'Tiramisù satisfaction',
    short: 'Tiramisù',
    options: [
      'Absolutely loved it',
      'Really good',
      'It was okay',
      'Not quite what I expected',
    ],
    weights: [100, 80, 55, 25],
  },
  q2: {
    title: 'Delivery & packaging',
    short: 'Delivery',
    options: [
      'Perfect — arrived fresh and well packed',
      'Good, no complaints',
      'Packaging could be better',
      'There was an issue',
    ],
    weights: [100, 78, 45, 15],
  },
  q3: {
    title: 'Would order again / recommend',
    short: 'Recommend',
    options: [
      '100% — already thinking about my next order',
      "Yes, I'd recommend you",
      'Maybe, depends on the occasion',
      'Probably not',
    ],
    weights: [100, 82, 50, 10],
  },
};

function resolveLabel(key, raw) {
  const formatted = formatStoredAnswer(raw);
  if (!formatted) return null;
  if (
    formatted.label &&
    formatted.label !== formatted.value &&
    !/^[1-4]$/.test(formatted.label) &&
    formatted.label !== 'done'
  ) {
    return formatted.label;
  }
  return answerLabelFor(key, formatted.value);
}

function sentimentFor(key, label) {
  const idx = QUESTION_META[key].options.indexOf(label);
  if (idx <= 1) return 'positive';
  if (idx === 2) return 'neutral';
  return 'negative';
}

function buildQuestionStats(key, results) {
  const meta = QUESTION_META[key];
  const counts = new Map(meta.options.map((o) => [o, 0]));
  let weighted = 0;
  let total = 0;

  for (const row of results) {
    const label = resolveLabel(key, row.answers?.[key]);
    if (!label) continue;
    const idx = meta.options.indexOf(label);
    if (idx >= 0) {
      counts.set(label, (counts.get(label) || 0) + 1);
      weighted += meta.weights[idx];
      total += 1;
    }
  }

  const options = meta.options.map((label) => {
    const count = counts.get(label) || 0;
    return {
      label,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
      sentiment: sentimentFor(key, label),
    };
  });

  return {
    key,
    title: meta.title,
    short: meta.short,
    score: total ? Math.round(weighted / total) : 0,
    responseCount: total,
    options,
  };
}

export function computeCampaignAnalytics(results) {
  const enrolled = results.length;
  const completed = results.filter((r) => r.completed_at).length;
  const inProgress = enrolled - completed;
  const completionRate = enrolled ? Math.round((completed / enrolled) * 100) : 0;
  const withAnswers = results.filter((r) => r.completed_at || Object.keys(r.answers || {}).length > 0);
  const questions = ['q1', 'q2', 'q3'].map((k) => buildQuestionStats(k, withAnswers));

  const reviewDone = results.filter((r) => {
    const label = resolveLabel('done', r.answers?.done);
    return label && r.completed_at;
  }).length;
  const reviewRate = completed ? Math.round((reviewDone / completed) * 100) : 0;

  const scored = questions.filter((q) => q.responseCount > 0);
  const overallScore = scored.length
    ? Math.round(scored.reduce((s, q) => s + q.score, 0) / scored.length)
    : 0;

  const insights = [];
  if (enrolled === 0) {
    insights.push({
      type: 'action',
      title: 'No data yet',
      detail: 'Send your first follow-up from Queue → Survey tab to start collecting feedback.',
    });
    return { enrolled, completed, inProgress, completionRate, reviewDone, reviewRate, overallScore, questions, insights };
  }

  const [q1, q2, q3] = questions;

  if (overallScore >= 85) {
    insights.push({
      type: 'success',
      title: 'Strong overall satisfaction',
      detail: `Average score ${overallScore}/100. Customers love what you're doing.`,
    });
  } else if (overallScore > 0 && overallScore < 60) {
    insights.push({
      type: 'warning',
      title: 'Satisfaction needs attention',
      detail: `Overall score is ${overallScore}/100. Fix the weakest area first.`,
    });
  }

  if (q1.responseCount > 0) {
    const negative = q1.options.filter((o) => o.sentiment === 'negative' && o.count > 0);
    if (negative.length) {
      insights.push({
        type: 'warning',
        title: 'Tiramisù feedback flagged',
        detail: `${negative[0].count} customer(s) said "${negative[0].label}". Check consistency and temperature.`,
      });
    } else if (q1.score >= 90) {
      insights.push({
        type: 'success',
        title: 'Tiramisù is a hit',
        detail: `${q1.score}% satisfaction. Highlight it in your Grab listing.`,
      });
    }
  }

  if (q2.responseCount > 0) {
    const issue = q2.options.find((o) => o.label.includes('issue') && o.count > 0);
    const packaging = q2.options.find((o) => o.label.includes('Packaging could') && o.count > 0);
    if (issue) {
      insights.push({
        type: 'action',
        title: 'Delivery issue reported',
        detail: `${issue.count} customer(s) had a delivery issue. Contact them personally.`,
      });
    } else if (packaging) {
      insights.push({
        type: 'action',
        title: 'Improve packaging',
        detail: `${packaging.count} customer(s) want better packaging.`,
      });
    }
  }

  if (q3.responseCount > 0) {
    const wont = q3.options.find((o) => o.label.includes('Probably not') && o.count > 0);
    const champions = q3.options.find((o) => o.label.includes('100%') && o.count > 0);
    if (wont) {
      insights.push({
        type: 'action',
        title: 'At-risk customers',
        detail: `${wont.count} customer(s) unlikely to reorder. Follow up within 24h.`,
      });
    }
    if (champions) {
      insights.push({
        type: 'success',
        title: 'Repeat buyers identified',
        detail: `${champions.count} customer(s) want their next order soon.`,
      });
    }
  }

  if (completionRate < 50 && enrolled >= 2) {
    insights.push({
      type: 'action',
      title: 'Low completion rate',
      detail: `Only ${completionRate}% finish the survey. Send welcome 1–2h after delivery.`,
    });
  }

  if (completed > 0 && reviewRate < 100) {
    insights.push({
      type: 'action',
      title: 'Grab reviews pending',
      detail: `${completed - reviewDone} customer(s) haven't confirmed their Grab review.`,
    });
  }

  if (insights.length === 0 && completed > 0) {
    insights.push({
      type: 'success',
      title: 'Healthy feedback loop',
      detail: 'Aim for 10+ completed surveys for reliable trends.',
    });
  }

  return { enrolled, completed, inProgress, completionRate, reviewDone, reviewRate, overallScore, questions, insights };
}

export function displayAnswer(key, raw) {
  const label = resolveLabel(key, raw);
  if (!label) return '—';
  if (key === 'done') return 'Grab review ✓';
  return label;
}
