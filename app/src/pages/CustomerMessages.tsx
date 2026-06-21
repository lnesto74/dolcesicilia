import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Send,
  CheckCircle2,
  Loader2,
  ChevronRight,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import { MessagePrefChip } from '../components/MessagePrefChip';
import {
  fillTemplate,
  firstNameFromFullName,
  whatsappUrl,
  type MessageTemplate,
} from '@shared/messageTemplates';
import {
  isEligibleForLaunchCampaign,
  PREFERENCE_POLL_TEMPLATE_ID,
  PREFERENCE_POLL_OPTIONS,
} from '@shared/messagePreferences';
import { getPhoneValidationWarning } from '@shared/phoneValidation';
import {
  checkMessageDuplicate,
  duplicateSkipReason,
  isMessageDedupExemptPhone,
} from '@shared/messageDedup';
import { fillPromoMessage, type CustomerSegment, PROMO_CAMPAIGNS } from '@shared/customerSegments';
import { ONBOARDING_INTRO_BODY } from '@shared/onboardingFlow';

import { API_URL, apiUnreachableMessage, parseApiJson } from '../lib/api';

const LEGACY_ONE_OFF_TEMPLATE_IDS = new Set([
  'welcome-first-order',
  'general-feedback',
  'orange-liquor-feedback',
]);

/** Synthetic segment — first orders today/yesterday without Neighbourhood Welcome sent. */
const ONBOARDING_PENDING_SEGMENT_ID = 'onboarding-pending-manual';

function pickOnboardingTemplate(templates: MessageTemplate[]) {
  return templates.find((t) => t.id === PREFERENCE_POLL_TEMPLATE_ID) ?? templates[0];
}

function findLucaTestContact(contacts: SavedContact[]): SavedContact | null {
  return contacts.find((c) => isMessageDedupExemptPhone(c.phone)) ?? null;
}

function buildManualSendReady(ready: SavedContact[], luca: SavedContact | null): SavedContact[] {
  if (!luca) return ready;
  return [luca, ...ready.filter((c) => c.id !== luca.id)];
}

function defaultManualSelectedIds(
  contacts: SavedContact[],
  audience: SavedContact[],
  hubManual: boolean,
): Set<string> {
  if (hubManual) {
    const luca = findLucaTestContact(contacts);
    if (luca) return new Set([luca.id]);
  }
  return new Set(audience.map((c) => c.id));
}

const MIN_DAYS_BETWEEN_MESSAGES = 7;

interface SentMessage {
  template_id: string;
  template_name: string;
  sent_at: string;
}

interface SentLogSummary {
  template_id: string;
  template_name: string;
  message_body: string;
  sent_at: string;
}

interface SavedContact {
  id: string;
  name: string;
  phone: string;
  order_count?: number;
  customer_type?: string;
  message_pref?: string | null;
  last_seen_at?: string;
  last_launch_sent_at?: string | null;
  sentMessages: SentMessage[];
  sentLogSummary?: SentLogSummary[];
  orders?: {
    ordered_at: string;
    order_value?: number | null;
    currency?: string;
    is_first_order?: number;
  }[];
  orderStats?: {
    count: number;
    firstOrderAt: string;
    lastOrderAt: string;
    firstOrderValue: number | null;
    maxOrderValue: number | null;
    totalValue: number;
  } | null;
}

interface QueueItem {
  contactId: string;
  contactName: string;
  messageBody: string;
  templateId?: string | null;
  templateName?: string | null;
  createdAt?: string;
}

interface MessageGroup {
  body: string;
  items: QueueItem[];
  recipients: SavedContact[];
  segmentId?: string;
  segmentName?: string;
  groupLabel: string;
  sourceLabel: string;
  perRecipient?: boolean;
}

interface SendWizard {
  contacts: SavedContact[];
  index: number;
  templateId: string;
  templateName: string;
  campaignType?: string;
  sentAll?: boolean;
}

interface ClaudeDraftMessage {
  contactId: string;
  contactName: string;
  body: string;
}

interface ClaudeDraftGroup {
  segmentId: string;
  segmentName: string;
  campaignId: string;
  promoKeyword: string | null;
  rationale: string;
  messages: ClaudeDraftMessage[];
}

function todayKeySg(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function addDayKeySg(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function hasNeighbourhoodWelcomeSent(contact: SavedContact): boolean {
  return (
    contact.sentMessages?.some((m) => m.template_id === PREFERENCE_POLL_TEMPLATE_ID) ||
    contact.sentLogSummary?.some((m) => m.template_id === PREFERENCE_POLL_TEMPLATE_ID) ||
    false
  );
}

function firstOrderDayForContact(contact: SavedContact): string | null {
  const fromOrders = (contact.orders ?? [])
    .map((o) => String(o.ordered_at || '').replace('T', ' ').slice(0, 10))
    .filter(Boolean)
    .sort();
  if (fromOrders.length > 0) return fromOrders[0];
  const seen = contact.last_seen_at?.slice(0, 10);
  return seen || null;
}

function computePendingOnboardingFromContacts(contacts: SavedContact[]) {
  const today = todayKeySg();
  const yesterday = addDayKeySg(today, -1);
  return contacts
    .filter((c) => {
      if (!c.phone || c.phone.startsWith('pending-')) return false;
      if (hasNeighbourhoodWelcomeSent(c)) return false;
      const firstDay = firstOrderDayForContact(c);
      return firstDay === today || firstDay === yesterday;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      first_order_day: firstOrderDayForContact(c) ?? undefined,
    }));
}

function formatOrderWhenSg(iso: string): string {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const day = new Date(normalized).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const today = todayKeySg();
  if (day === today) return 'Today';
  if (day === addDayKeySg(today, -1)) return 'Yesterday';
  return new Date(normalized).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function contactOrderSummary(contact: SavedContact): { when: string; size: string; orderCount: number } {
  const stats = contact.orderStats;
  const orders = contact.orders ?? [];
  const latest = orders[0];
  const whenIso = stats?.lastOrderAt ?? latest?.ordered_at ?? contact.last_seen_at;
  const when = whenIso ? formatOrderWhenSg(whenIso) : '—';
  let size = '—';
  if (latest?.order_value != null && latest.order_value > 0) {
    size = `S$${latest.order_value}`;
  } else if (stats?.firstOrderValue != null && stats.firstOrderValue > 0) {
    size = `S$${stats.firstOrderValue}`;
  } else if (stats?.maxOrderValue != null && stats.maxOrderValue > 0) {
    size = `S$${stats.maxOrderValue}`;
  }
  const orderCount = stats?.count ?? orders.length ?? contact.order_count ?? 0;
  return { when, size, orderCount };
}

function daysSince(iso: string): number {
  const ms = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(ms)) return Infinity;
  return (Date.now() - ms) / 86400000;
}

function recentlyMessaged(contact: SavedContact): boolean {
  if (isMessageDedupExemptPhone(contact.phone)) return false;
  if (!contact.sentMessages?.length) return false;
  const latest = contact.sentMessages.reduce((a, b) => (a.sent_at > b.sent_at ? a : b));
  return daysSince(latest.sent_at) < MIN_DAYS_BETWEEN_MESSAGES;
}

function parseQueueItemFromApi(q: {
  contactId: string;
  contactName: string;
  messageBody: string;
  templateId?: string | null;
  templateName?: string | null;
  createdAt?: string;
}): QueueItem {
  return {
    contactId: q.contactId,
    contactName: q.contactName,
    messageBody: q.messageBody,
    templateId: q.templateId ?? null,
    templateName: q.templateName ?? null,
    createdAt: q.createdAt,
  };
}

function segmentIdFromTemplateId(templateId?: string | null): string | null {
  if (!templateId?.startsWith('claude:')) return null;
  const rest = templateId.slice('claude:'.length);
  return rest || null;
}

function queueSourceLabel(item?: QueueItem | null): string {
  if (!item) return 'Queued message';
  if (item.templateName?.includes('Composed by Claude')) return 'Composed by Claude';
  if (item.templateName?.startsWith('Claude ·')) return 'Server draft (fallback)';
  if (segmentIdFromTemplateId(item.templateId)) return 'Composed by Claude';
  if (item.templateId?.startsWith('promo:')) return 'Static promo';
  if (item.templateId === 'custom') return 'Custom';
  return item.templateName || 'Queued message';
}

function filterQueueBySegment(items: QueueItem[], segment: CustomerSegment): QueueItem[] {
  const segContactIds = new Set(segment.contacts.map((c) => c.id));
  return items.filter((q) => {
    const segFromTid = segmentIdFromTemplateId(q.templateId);
    if (segFromTid) {
      return segFromTid === segment.id || segFromTid === segment.campaign?.id;
    }
    return segContactIds.has(q.contactId);
  });
}

function groupByBody(items: QueueItem[], contactById: Map<string, SavedContact>): MessageGroup[] {
  const groups: MessageGroup[] = [];
  const indexByBody = new Map<string, number>();

  for (const item of items) {
    let idx = indexByBody.get(item.messageBody);
    if (idx === undefined) {
      idx = groups.length;
      indexByBody.set(item.messageBody, idx);
      groups.push({
        body: item.messageBody,
        items: [item],
        recipients: [],
        groupLabel: '',
        sourceLabel: queueSourceLabel(item),
      });
    } else {
      groups[idx].items.push(item);
    }
  }

  return groups
    .map((g, i) => ({
      ...g,
      recipients: g.items
        .map((it) => contactById.get(it.contactId))
        .filter((c): c is SavedContact => !!c),
      groupLabel: g.groupLabel || variantLabel(i),
      perRecipient:
        g.items.length === 1 ||
        new Set(g.items.map((it) => it.messageBody)).size === g.items.length,
    }))
    .filter((g) => g.recipients.length > 0);
}

/** Group by segment (claude:*) when tagged; otherwise by identical body */
function groupQueueItems(
  items: QueueItem[],
  contacts: SavedContact[],
  segmentsById: Record<string, CustomerSegment>,
): MessageGroup[] {
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const hasSegmentTags = items.some((i) => segmentIdFromTemplateId(i.templateId));

  if (!hasSegmentTags) {
    return groupByBody(items, contactById);
  }

  const groups: MessageGroup[] = [];
  const bySegment = new Map<string, QueueItem[]>();
  const untagged: QueueItem[] = [];

  for (const item of items) {
    const segId = segmentIdFromTemplateId(item.templateId);
    if (!segId) {
      untagged.push(item);
      continue;
    }
    if (!bySegment.has(segId)) bySegment.set(segId, []);
    bySegment.get(segId)!.push(item);
  }

  for (const [segId, segItems] of bySegment) {
    const seg = segmentsById[segId];
    const segmentName = seg?.name ?? segId.replace(/-/g, ' ');
    const uniqueBodies = new Set(segItems.map((i) => i.messageBody)).size;
    const allUnique = uniqueBodies === segItems.length && segItems.length > 1;

    if (allUnique) {
      for (const item of segItems) {
        const contact = contactById.get(item.contactId);
        if (!contact) continue;
        groups.push({
          body: item.messageBody,
          items: [item],
          recipients: [contact],
          segmentId: segId,
          segmentName,
          groupLabel: `${segmentName} · ${contact.name}`,
          sourceLabel: queueSourceLabel(item),
          perRecipient: true,
        });
      }
    } else {
      const bodyGroups = groupByBody(segItems, contactById);
      bodyGroups.forEach((bg, idx) => {
        groups.push({
          ...bg,
          segmentId: segId,
          segmentName,
          groupLabel:
            bodyGroups.length > 1
              ? `${segmentName} · ${variantLabel(idx)}`
              : segmentName,
          sourceLabel: queueSourceLabel(bg.items[0]),
        });
      });
    }
  }

  if (untagged.length > 0) {
    groups.push(...groupByBody(untagged, contactById));
  }

  return groups;
}

function queueLoadedStatus(queue: QueueItem[]): string {
  const label = queueSourceLabel(queue[0]).toLowerCase();
  const tailored =
    queue.length > 1 && !queue.every((q) => q.messageBody === queue[0].messageBody);
  return queue.length === 1
    ? `1 message ${label} — review and send`
    : `${queue.length} messages ${label}${tailored ? ' (each tailored)' : ''} — review and send`;
}

function variantLabel(index: number) {
  return `Variant ${String.fromCharCode(65 + index)}`;
}

const VARIANT_ACCENTS = [
  {
    border: 'border-mediterranean-800',
    bg: 'bg-mediterranean-50',
    header: 'text-mediterranean-900',
    badge: 'bg-mediterranean-800 text-white',
  },
  {
    border: 'border-amber-500',
    bg: 'bg-amber-50',
    header: 'text-amber-950',
    badge: 'bg-amber-600 text-white',
  },
  {
    border: 'border-mediterranean-600',
    bg: 'bg-cream-400',
    header: 'text-ink-900',
    badge: 'bg-mediterranean-700 text-white',
  },
] as const;

type MessageSource = 'segment-promo' | 'template' | 'custom' | 'queued';

export function CustomerMessages({
  variant = 'full',
  onSurveyCountsChange,
}: {
  variant?: 'full' | 'compose' | 'queue' | 'hub';
  onSurveyCountsChange?: () => void;
}) {
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [pendingManual, setPendingManual] = useState<
    { id: string; name: string; phone: string; first_order_day?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [customBody, setCustomBody] = useState('');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');
  const [wizard, setWizard] = useState<SendWizard | null>(null);
  const [openwaEnabled, setOpenwaEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));
  const [showAlreadySent, setShowAlreadySent] = useState(true);
  const [messageSource, setMessageSource] = useState<MessageSource>('template');
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [whatTab, setWhatTab] = useState<'segment' | 'templates' | 'custom' | 'claude'>('segment');
  const [claudeDrafts, setClaudeDrafts] = useState<ClaudeDraftGroup[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [stagingDrafts, setStagingDrafts] = useState(false);
  const [serverDraftPreview, setServerDraftPreview] = useState<ClaudeDraftGroup[]>([]);
  const [hubMode, setHubMode] = useState<'claude' | 'manual'>('claude');
  const initialized = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /** DB queue is the source of truth; hub never falls back to in-memory drafts */
  const effectiveQueueItems = useMemo(() => {
    if (queueItems.length > 0) return queueItems;
    if (variant === 'hub' || claudeDrafts.length === 0) return [];
    return claudeDrafts.flatMap((d) =>
      d.messages.map((m) => ({
        contactId: m.contactId,
        contactName: m.contactName,
        messageBody: m.body,
        templateId: `claude:${d.segmentId}`,
        templateName: `Claude · ${d.segmentName}`,
      })),
    );
  }, [queueItems, claudeDrafts, variant]);

  const segmentsForWho = useMemo(() => {
    const pendingSegment: CustomerSegment = {
      id: ONBOARDING_PENDING_SEGMENT_ID,
      name: 'New orders — today & yesterday',
      who:
        pendingManual.length > 0
          ? 'First order yesterday or today · Neighbourhood Welcome not sent yet'
          : 'No one waiting right now (already sent or no orders in last 2 days)',
      promo: 'Onboarding',
      campaign: PROMO_CAMPAIGNS[0],
      count: pendingManual.length,
      contacts: pendingManual.map((c) => {
        const full = contacts.find((x) => x.id === c.id);
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          customer_type: full?.customer_type ?? 'first_time',
          order_count: full?.order_count ?? 1,
          lastOrderAt: null,
          daysSinceOrder: 0,
          totalSpend: 0,
          firstOrderValue: null,
          maxOrderValue: null,
          message_pref: full?.message_pref ?? 'unset',
          primarySegment: 'new-nurture' as const,
        };
      }),
    };
    return [pendingSegment, ...segments];
  }, [segments, pendingManual, contacts]);

  const activeSegment = segmentsForWho.find((s) => s.id === selectedSegmentId) ?? null;

  /** Hub segment picker filters the queue view without mutating DB */
  const displayQueueItems = useMemo(() => {
    if (variant !== 'hub' || !selectedSegmentId || effectiveQueueItems.length === 0) {
      return effectiveQueueItems;
    }
    const seg = segmentsForWho.find((s) => s.id === selectedSegmentId);
    if (!seg) return effectiveQueueItems;
    return filterQueueBySegment(effectiveQueueItems, seg);
  }, [variant, selectedSegmentId, effectiveQueueItems, segmentsForWho]);

  const hasQueuedMessages = effectiveQueueItems.length > 0;
  const mode = hasQueuedMessages ? 'queued' : 'template';
  const hubManualMode = variant === 'hub' && hubMode === 'manual';
  const reviewingQueue =
    variant === 'hub' ? hasQueuedMessages && hubMode === 'claude' : hasQueuedMessages;
  const queueSourceSummary = useMemo(
    () => (effectiveQueueItems.length > 0 ? queueSourceLabel(effectiveQueueItems[0]) : null),
    [effectiveQueueItems],
  );

  const showStatus = useCallback((msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
    setStatus(msg);
    setStatusKind(kind);
  }, []);

  useEffect(() => {
    if (variant === 'hub' && hubMode === 'claude') setWhatTab('claude');
  }, [variant, hubMode]);

  const serverDraftItems = useMemo(
    () =>
      serverDraftPreview.flatMap((d) =>
        d.messages.map((m) => ({
          contactId: m.contactId,
          contactName: m.contactName,
          messageBody: m.body,
          templateId: `claude:${d.campaignId || d.segmentId}`,
          templateName: `Claude · ${d.segmentName}`,
        })),
      ),
    [serverDraftPreview],
  );

  const applyClaudeDraftPreview = useCallback((data: { drafts?: ClaudeDraftGroup[] }) => {
    const drafts = data.drafts || [];
    setServerDraftPreview(drafts);
    setClaudeDrafts([]);
    return drafts.reduce((n, d) => n + d.messages.length, 0);
  }, []);

  const reloadQueueFromApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/messages/queue`);
      if (!res.ok) return;
      const data = await res.json();
      const queue: QueueItem[] = (data.queue || []).map(parseQueueItemFromApi);
      if (queue.length > 0) {
        setQueueItems(queue);
        setSelectedIds(new Set(queue.map((q) => q.contactId)));
        setMessageSource('queued');
        setUseCustom(true);
      } else {
        setQueueItems([]);
        setSelectedIds(new Set());
      }
    } catch {
      /* ignore */
    }
  }, []);

  const syncQueueFromClaudeDrafts = useCallback(
    (drafts: ClaudeDraftGroup[], segmentId?: string) => {
      const filtered = segmentId ? drafts.filter((d) => d.segmentId === segmentId) : drafts;
      const items: QueueItem[] = filtered.flatMap((d) =>
        d.messages.map((m) => ({
          contactId: m.contactId,
          contactName: m.contactName,
          messageBody: m.body,
        })),
      );
      if (items.length === 0) return false;
      setQueueItems(items);
      setSelectedIds(new Set(items.map((q) => q.contactId)));
      setMessageSource('queued');
      setUseCustom(true);
      setWhatTab('claude');
      return true;
    },
    [],
  );

  const activeTemplate = templates.find((t) => t.id === templateId) ?? pickOnboardingTemplate(templates);

  const hubTemplateGroups = useMemo(() => {
    const onboarding = templates.find((t) => t.id === PREFERENCE_POLL_TEMPLATE_ID);
    const other = templates.filter(
      (t) => t.id !== PREFERENCE_POLL_TEMPLATE_ID && !LEGACY_ONE_OFF_TEMPLATE_IDS.has(t.id),
    );
    const legacy = templates.filter((t) => LEGACY_ONE_OFF_TEMPLATE_IDS.has(t.id));
    return { onboarding, other, legacy };
  }, [templates]);

  const segmentsById = useMemo(
    () => Object.fromEntries(segments.map((s) => [s.id, s])),
    [segments],
  );

  const bodyByContactId = useMemo(() => {
    const m = new Map<string, string>();
    const source = variant === 'hub' && reviewingQueue ? displayQueueItems : effectiveQueueItems;
    for (const q of source) m.set(q.contactId, q.messageBody);
    return m;
  }, [effectiveQueueItems, displayQueueItems, variant, mode]);

  const hasSentTemplate = (contact: SavedContact, tid: string) =>
    contact.sentMessages?.some((m) => m.template_id === tid) ||
    contact.sentLogSummary?.some((m) => m.template_id === tid);

  const isDuplicateForContact = useCallback(
    (contact: SavedContact, body: string, tid: string) => {
      if (isMessageDedupExemptPhone(contact.phone)) return false;
      const dup = checkMessageDuplicate({
        sentLogs: contact.sentLogSummary || [],
        templateId: tid,
        body,
      });
      return dup.duplicate;
    },
    [],
  );

  const duplicateBlockReason = useCallback(
    (contact: SavedContact, body: string, tid: string) => {
      if (isMessageDedupExemptPhone(contact.phone)) return null;
      const dup = checkMessageDuplicate({
        sentLogs: contact.sentLogSummary || [],
        templateId: tid,
        body,
      });
      return dup.duplicate ? `${contact.name} already got this message (${duplicateSkipReason(dup)})` : null;
    },
    [],
  );

  interface ContactClassification {
    eligible: boolean;
    reason?: string;
    sentAt?: string;
  }

  const classifyContactForTemplate = useCallback(
    (contact: SavedContact, template: MessageTemplate): ContactClassification => {
      const tid = template.id;
      const rawBody =
        tid === PREFERENCE_POLL_TEMPLATE_ID ? template.body || ONBOARDING_INTRO_BODY : template.body;
      const body = fillTemplate(rawBody, contact.name);

      if (template.campaignType === 'launch' && !isEligibleForLaunchCampaign(contact)) {
        const pref = contact.message_pref || 'unset';
        if (pref === 'opt_out' || pref === 'unset') {
          return { eligible: false, reason: pref === 'opt_out' ? 'Opted out' : 'No preference set' };
        }
        return { eligible: false, reason: 'Launch frequency cap' };
      }

      const phoneWarning = getPhoneValidationWarning(contact.phone);
      if (phoneWarning && !isMessageDedupExemptPhone(contact.phone)) {
        return { eligible: false, reason: phoneWarning };
      }

      if (!isMessageDedupExemptPhone(contact.phone)) {
        if (hasSentTemplate(contact, tid)) {
          const log = contact.sentLogSummary?.find((l) => l.template_id === tid);
          return {
            eligible: false,
            reason: 'Already sent',
            sentAt: log?.sent_at || contact.sentMessages?.find((m) => m.template_id === tid)?.sent_at,
          };
        }
        if (isDuplicateForContact(contact, body, tid)) {
          const dup = checkMessageDuplicate({
            sentLogs: contact.sentLogSummary || [],
            templateId: tid,
            body,
          });
          if (dup.duplicate) {
            return {
              eligible: false,
              reason: duplicateSkipReason(dup),
              sentAt: dup.sentAt,
            };
          }
        }
        if (tid !== PREFERENCE_POLL_TEMPLATE_ID && recentlyMessaged(contact)) {
          const latest = contact.sentMessages?.reduce((a, b) => (a.sent_at > b.sent_at ? a : b));
          return { eligible: false, reason: 'Messaged in the last 7 days', sentAt: latest?.sent_at };
        }
      }

      return { eligible: true };
    },
    [isDuplicateForContact],
  );

  const classifyContactForPromo = useCallback(
    (contact: SavedContact, segment: CustomerSegment): ContactClassification => {
      const body = fillPromoMessage(segment.campaign.body, contact.name);
      const tid = `promo:${segment.campaign.id}`;

      const phoneWarning = getPhoneValidationWarning(contact.phone);
      if (phoneWarning && !isMessageDedupExemptPhone(contact.phone)) {
        return { eligible: false, reason: phoneWarning };
      }

      if (!isMessageDedupExemptPhone(contact.phone)) {
        if (isDuplicateForContact(contact, body, tid)) {
          const dup = checkMessageDuplicate({
            sentLogs: contact.sentLogSummary || [],
            templateId: tid,
            body,
          });
          if (dup.duplicate) {
            return {
              eligible: false,
              reason: duplicateSkipReason(dup),
              sentAt: dup.sentAt,
            };
          }
        }
        if (recentlyMessaged(contact)) {
          const latest = contact.sentMessages?.reduce((a, b) => (a.sent_at > b.sent_at ? a : b));
          return { eligible: false, reason: 'Messaged in the last 7 days', sentAt: latest?.sent_at };
        }
      }

      return { eligible: true };
    },
    [isDuplicateForContact],
  );

  const getAudiencePool = useCallback(
    (template: MessageTemplate): SavedContact[] => {
      const segKey = template.targetSegment;
      if (segKey === 'first-time') {
        return contacts.filter(
          (c) =>
            (c.order_count ?? 1) <= 1 &&
            (c.customer_type === 'first_time' || (c.order_count ?? 1) <= 1),
        );
      }
      if (segKey && segmentsById[segKey]) {
        const ids = new Set(segmentsById[segKey].contacts.map((c) => c.id));
        return contacts.filter((c) => ids.has(c.id));
      }
      return contacts;
    },
    [contacts, segmentsById],
  );

  const resolveAudience = useCallback(
    (template: MessageTemplate): SavedContact[] => {
      return getAudiencePool(template).filter((c) =>
        classifyContactForTemplate(c, template).eligible,
      );
    },
    [getAudiencePool, classifyContactForTemplate],
  );

  const resolveAudienceInSegment = useCallback(
    (template: MessageTemplate, segment: CustomerSegment): SavedContact[] => {
      const segIds = new Set(segment.contacts.map((c) => c.id));
      return getAudiencePool(template)
        .filter((c) => segIds.has(c.id))
        .filter((c) => classifyContactForTemplate(c, template).eligible);
    },
    [getAudiencePool, classifyContactForTemplate],
  );

  const queuedCountBySegment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seg of segments) {
      counts.set(seg.id, filterQueueBySegment(effectiveQueueItems, seg).length);
    }
    return counts;
  }, [segments, effectiveQueueItems]);

  const recipientSplit = useMemo(() => {
    if (messageSource === 'segment-promo' && activeSegment) {
      const pool = contacts.filter((c) => activeSegment.contacts.some((sc) => sc.id === c.id));
      const ready: SavedContact[] = [];
      const alreadySent: { contact: SavedContact; reason: string; sentAt?: string }[] = [];
      for (const c of pool) {
        const cl = classifyContactForPromo(c, activeSegment);
        if (cl.eligible) ready.push(c);
        else alreadySent.push({ contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt });
      }
      return { ready, alreadySent };
    }
    if (messageSource !== 'template' || useCustom || !activeTemplate) {
      return {
        ready: [] as SavedContact[],
        alreadySent: [] as { contact: SavedContact; reason: string; sentAt?: string }[],
      };
    }
    let pool = getAudiencePool(activeTemplate);
    if (variant === 'hub' && activeSegment) {
      const segIds = new Set(activeSegment.contacts.map((c) => c.id));
      pool = pool.filter((c) => segIds.has(c.id));
    }
    const ready: SavedContact[] = [];
    const alreadySent: { contact: SavedContact; reason: string; sentAt?: string }[] = [];
    for (const c of pool) {
      const cl = classifyContactForTemplate(c, activeTemplate);
      if (cl.eligible) ready.push(c);
      else alreadySent.push({ contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt });
    }
    return { ready, alreadySent };
  }, [
    messageSource,
    activeSegment,
    contacts,
    classifyContactForPromo,
    useCustom,
    activeTemplate,
    getAudiencePool,
    classifyContactForTemplate,
    variant,
  ]);

  const lucaTestContact = useMemo(() => findLucaTestContact(contacts), [contacts]);

  const manualSendReady = useMemo(() => {
    if (!hubManualMode) return recipientSplit.ready;
    return buildManualSendReady(recipientSplit.ready, lucaTestContact);
  }, [hubManualMode, recipientSplit.ready, lucaTestContact]);

  const manualAudienceEmpty = hubManualMode && manualSendReady.length === 0;

  const fetchQueueFromApi = useCallback(async (): Promise<QueueItem[]> => {
    try {
      const res = await fetch(`${API_URL}/api/messages/queue`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.queue || []).map(parseQueueItemFromApi);
    } catch {
      return [];
    }
  }, []);

  const applyTemplateForSegment = useCallback(
    (template: MessageTemplate, segment?: CustomerSegment | null) => {
      const seg =
        segment ?? segmentsForWho.find((s) => s.id === selectedSegmentId) ?? null;
      const pool =
        variant === 'hub' && seg
          ? contacts.filter((c) => seg.contacts.some((sc) => sc.id === c.id))
          : getAudiencePool(template);
      const audience =
        variant === 'hub' && seg
          ? resolveAudienceInSegment(template, seg)
          : resolveAudience(template);
      const sentCount = pool.length - audience.length;
      setSelectedIds(
        defaultManualSelectedIds(contacts, audience, variant === 'hub' && hubMode === 'manual'),
      );
      if (variant !== 'hub') {
        setQueueItems([]);
      }
      setUseCustom(false);
      setMessageSource('template');
      setWhatTab('templates');
      setTemplateId(template.id);
      setShowAlreadySent(sentCount > 0);
      const segLabel =
        variant === 'hub' && seg
          ? seg.name
          : template.targetSegment
            ? segmentsById[template.targetSegment]?.name ?? template.targetSegment
            : 'eligible customers';
      if (audience.length > 0) {
        showStatus(
          variant === 'hub' && hubMode === 'manual' && findLucaTestContact(contacts)
            ? `Luca selected for test — tick customers in Send when ready (${audience.length} eligible in “${segLabel}”)`
            : `${audience.length} in “${segLabel}” ready for “${template.name}”${sentCount > 0 ? ` · ${sentCount} already sent (excluded)` : ''}`,
          'success',
        );
      } else {
        showStatus(
          variant === 'hub' && hubMode === 'manual' && findLucaTestContact(contacts)
            ? `No eligible customers in “${segLabel}” — Luca selected for test send`
            : sentCount > 0
              ? `Nobody left in “${segLabel}” for “${template.name}” — all already sent or not eligible`
              : `Nobody in “${segLabel}” for “${template.name}”`,
          'info',
        );
      }
    },
    [
      segments,
      segmentsForWho,
      selectedSegmentId,
      variant,
      contacts,
      resolveAudienceInSegment,
      resolveAudience,
      getAudiencePool,
      segmentsById,
      hubMode,
      showStatus,
    ],
  );

  const applyTemplate = useCallback(
    (template: MessageTemplate) => applyTemplateForSegment(template),
    [applyTemplateForSegment],
  );

  const applyManualStaticPromo = useCallback(
    (segment: CustomerSegment) => {
      const pool = contacts.filter((c) => segment.contacts.some((sc) => sc.id === c.id));
      const ready: SavedContact[] = [];
      const alreadySent: { contact: SavedContact; reason: string; sentAt?: string }[] = [];
      for (const c of pool) {
        const cl = classifyContactForPromo(c, segment);
        if (cl.eligible) ready.push(c);
        else alreadySent.push({ contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt });
      }
      setMessageSource('segment-promo');
      setUseCustom(false);
      setWhatTab('segment');
      setTemplateId(segment.campaign.id);
      setSelectedIds(defaultManualSelectedIds(contacts, ready, variant === 'hub' && hubMode === 'manual'));
      setShowAlreadySent(alreadySent.length > 0);
      if (ready.length > 0) {
        showStatus(
          variant === 'hub' && hubMode === 'manual' && findLucaTestContact(contacts)
            ? `Luca selected for test — ${ready.length} in “${segment.name}” when you're ready`
            : `${ready.length} in “${segment.name}” ready for static promo${alreadySent.length > 0 ? ` · ${alreadySent.length} skipped` : ''}`,
          'success',
        );
      } else {
        showStatus(
          variant === 'hub' && hubMode === 'manual' && findLucaTestContact(contacts)
            ? `Nobody eligible in “${segment.name}” — Luca selected for test send`
            : `Nobody eligible in “${segment.name}” for static promo`,
          'info',
        );
      }
    },
    [contacts, classifyContactForPromo, showStatus, variant, hubMode],
  );

  const applyManualCustom = useCallback(
    (segment: CustomerSegment) => {
      const pool = contacts.filter((c) => segment.contacts.some((sc) => sc.id === c.id));
      setUseCustom(true);
      setMessageSource('custom');
      setWhatTab('custom');
      setSelectedIds(defaultManualSelectedIds(contacts, pool, variant === 'hub' && hubMode === 'manual'));
      showStatus(
        variant === 'hub' && hubMode === 'manual' && findLucaTestContact(contacts)
          ? `Luca selected for test — ${pool.length} in “${segment.name}” when you're ready`
          : `${pool.length} in “${segment.name}” — write your message above`,
        'info',
      );
    },
    [contacts, showStatus, variant, hubMode],
  );

  const applySegment = useCallback(
    async (segment: CustomerSegment, opts?: { staticPromo?: boolean }) => {
      setSelectedSegmentId(segment.id);

      if (variant === 'hub' && hubMode === 'manual') {
        if (segment.id === ONBOARDING_PENDING_SEGMENT_ID) {
          const t = pickOnboardingTemplate(templates);
          if (t) {
            setWhatTab('templates');
            applyTemplateForSegment(t, segment);
          }
          return;
        }
        if (opts?.staticPromo || whatTab === 'segment') {
          applyManualStaticPromo(segment);
        } else if (whatTab === 'custom') {
          applyManualCustom(segment);
        } else if (whatTab === 'templates' && templateId === PREFERENCE_POLL_TEMPLATE_ID) {
          applyManualStaticPromo(segment);
          showStatus(
            `“${segment.name}” → static promo. Neighbourhood Welcome is only for New orders today/yesterday.`,
            'info',
          );
        } else {
          const t = templates.find((x) => x.id === templateId) ?? pickOnboardingTemplate(templates);
          if (t) applyTemplateForSegment(t, segment);
        }
        return;
      }

      let liveQueue = queueItems;
      if (variant === 'hub') {
        liveQueue = await fetchQueueFromApi();
        if (liveQueue.length > 0) {
          setQueueItems(liveQueue);
          setMessageSource('queued');
          setUseCustom(true);
        }
      }

      if (opts?.staticPromo) {
        if (variant === 'hub' && hubMode === 'claude' && liveQueue.length > 0) {
          showStatus('Switch to Manual mode for static promo, or send Claude queued messages first.', 'info');
          return;
        }
      } else if (variant === 'hub' && liveQueue.length > 0) {
        const filtered = filterQueueBySegment(liveQueue, segment);
        setSelectedIds(new Set(filtered.map((q) => q.contactId)));
        showStatus(
          filtered.length > 0
            ? `Showing ${filtered.length} queued message(s) for “${segment.name}”`
            : `No queued messages for “${segment.name}” in the current queue`,
          filtered.length > 0 ? 'success' : 'info',
        );
        return;
      }

      if (!opts?.staticPromo) {
        const draftsForSeg = claudeDrafts.filter((d) => d.segmentId === segment.id);
        if (draftsForSeg.length > 0 && syncQueueFromClaudeDrafts(claudeDrafts, segment.id)) {
          showStatus(
            `${draftsForSeg.reduce((n, d) => n + d.messages.length, 0)} Claude draft(s) for “${segment.name}” — review in Send`,
            'success',
          );
          return;
        }
      }

      if (variant === 'hub' && !opts?.staticPromo) {
        setMessageSource('segment-promo');
        setUseCustom(false);
        setTemplateId(segment.campaign.id);
        setWhatTab('claude');
        setSelectedIds(new Set());
        setShowAlreadySent(false);
        showStatus(
          `“${segment.name}” selected — switch to Manual mode for templates, or ask Claude to queue messages`,
          'info',
        );
        return;
      }

      const pool = contacts.filter((c) => segment.contacts.some((sc) => sc.id === c.id));
      const ready: SavedContact[] = [];
      const alreadySent: { contact: SavedContact; reason: string; sentAt?: string }[] = [];
      for (const c of pool) {
        const cl = classifyContactForPromo(c, segment);
        if (cl.eligible) ready.push(c);
        else alreadySent.push({ contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt });
      }
      setMessageSource('segment-promo');
      setUseCustom(false);
      setQueueItems([]);
      setClaudeDrafts([]);
      setTemplateId(segment.campaign.id);
      setWhatTab(opts?.staticPromo ? 'segment' : variant === 'hub' ? 'claude' : 'segment');
      setSelectedIds(new Set(ready.map((c) => c.id)));
      setShowAlreadySent(alreadySent.length > 0);
      if (ready.length > 0) {
        showStatus(
          `${ready.length} ready for static “${segment.name}” promo${alreadySent.length > 0 ? ` · ${alreadySent.length} skipped` : ''} — or Ask Claude for personalized`,
          'success',
        );
      } else {
        showStatus(
          alreadySent.length > 0
            ? `Nobody left in “${segment.name}” — all already messaged or not eligible`
            : `Nobody in “${segment.name}” right now`,
          'info',
        );
      }
    },
    [contacts, classifyContactForPromo, showStatus, variant, hubMode, whatTab, templateId, templates, applyTemplateForSegment, applyManualStaticPromo, applyManualCustom, claudeDrafts, syncQueueFromClaudeDrafts, queueItems, fetchQueueFromApi],
  );

  const switchHubMode = useCallback(
    (next: 'claude' | 'manual') => {
      setHubMode(next);
      if (next === 'claude') {
        setWhatTab('claude');
        void reloadQueueFromApi();
        const seg = segments.find((s) => s.id === selectedSegmentId);
        if (seg && effectiveQueueItems.length > 0) {
          const filtered = filterQueueBySegment(queueItems, seg);
          setSelectedIds(new Set(filtered.map((q) => q.contactId)));
        }
      } else {
        const pendingSeg = segmentsForWho.find((s) => s.id === ONBOARDING_PENDING_SEGMENT_ID);
        const current = segmentsForWho.find((s) => s.id === selectedSegmentId);
        const seg =
          (pendingSeg && pendingSeg.count > 0 ? pendingSeg : null) ??
          current ??
          segmentsForWho.find((s) => s.count > 0) ??
          segmentsForWho[0];
        if (seg) {
          setSelectedSegmentId(seg.id);
          if (seg.id === ONBOARDING_PENDING_SEGMENT_ID) {
            setWhatTab('templates');
            const t = pickOnboardingTemplate(templates);
            if (t) applyTemplateForSegment(t, seg);
          } else {
            applyManualStaticPromo(seg);
          }
        }
      }
    },
    [
      reloadQueueFromApi,
      segments,
      segmentsForWho,
      selectedSegmentId,
      effectiveQueueItems.length,
      queueItems,
      templates,
      applyTemplateForSegment,
      applyManualStaticPromo,
    ],
  );

  const bodyFor = useCallback(
    (contact: SavedContact): string => {
      if (reviewingQueue && bodyByContactId.has(contact.id)) return bodyByContactId.get(contact.id)!;
      if (useCustom || messageSource === 'custom') return customBody;
      if (messageSource === 'segment-promo' && activeSegment) return activeSegment.campaign.body;
      return activeTemplate?.body || ONBOARDING_INTRO_BODY;
    },
    [bodyByContactId, reviewingQueue, useCustom, messageSource, customBody, activeSegment, activeTemplate],
  );

  const previewBody = useCallback(
    (contact: SavedContact): string => {
      let raw = bodyFor(contact);
      const first = firstNameFromFullName(contact.name);
      if (first && first !== 'there') {
        const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        raw = raw.replace(new RegExp(`(\\{\\{firstName\\}\\}),?\\s+${esc}\\b`, 'gi'), '{{firstName}}');
      }
      if (messageSource === 'segment-promo' && !reviewingQueue) {
        return fillPromoMessage(raw, contact.name);
      }
      return fillTemplate(raw, contact.name);
    },
    [bodyFor, messageSource, reviewingQueue],
  );

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, settingsRes, templatesRes, queueRes, segmentsRes, pendingRes] =
        await Promise.all([
        fetch(`${API_URL}/api/contacts?withMessages=1`),
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/templates`),
        fetch(`${API_URL}/api/messages/queue`),
        fetch(`${API_URL}/api/segments`),
        fetch(`${API_URL}/api/onboarding/pending-manual`),
      ]);

      let loadedContacts: SavedContact[] = [];
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        loadedContacts = data.contacts || [];
        setContacts(loadedContacts);
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setOpenwaEnabled(s.openwaEnabled ?? false);
      }
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }
      if (segmentsRes.ok) {
        const data = await segmentsRes.json();
        setSegments(data.segments || []);
        if (Array.isArray(data.pendingOnboarding) && data.pendingOnboarding.length > 0) {
          setPendingManual(data.pendingOnboarding);
        }
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingManual(data.contacts || []);
      } else if (loadedContacts.length > 0) {
        setPendingManual(computePendingOnboardingFromContacts(loadedContacts));
      }
      if (queueRes.ok) {
        const data = await queueRes.json();
        const queue: QueueItem[] = (data.queue || []).map(parseQueueItemFromApi);
        if (queue.length > 0) {
          setQueueItems(queue);
          setSelectedIds(new Set(queue.map((q) => q.contactId)));
          setUseCustom(true);
          setMessageSource('queued');
          if (variant === 'hub') {
            setHubMode('claude');
            setWhatTab('claude');
          }
          const allSame = queue.every((q) => q.messageBody === queue[0].messageBody);
          if (allSame) setCustomBody(queue[0].messageBody);
          if (variant !== 'hub') {
            try {
              const draftsRes = await fetch(`${API_URL}/api/ai/draft-messages/latest`);
              if (draftsRes.ok) {
                const draftData = await draftsRes.json();
                if (draftData.drafts?.length) setClaudeDrafts(draftData.drafts);
              }
            } catch {
              /* ignore */
            }
          }
          showStatus(queueLoadedStatus(queue), 'success');
          initialized.current = true;
        }
      }
    } catch {
      setStatus('Could not load — is the server running? Run ./scripts/restart.sh on your Mac.');
    }
    setLoading(false);
  }, [variant]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const applyCtaFromUrl = useCallback(async () => {
    const ctaId = searchParams.get('cta');
    if (!ctaId) return;
    try {
      const res = await fetch(`${API_URL}/api/daily-brief/latest`);
      if (!res.ok) return;
      const data = await res.json();
      const cta = data.brief?.ctas?.find((c: { id: string }) => c.id === ctaId);
      if (!cta?.contactIds?.length || !cta.messageBody) return;

      await fetch(`${API_URL}/api/messages/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: cta.contactIds, body: cta.messageBody }),
      });

      setQueueItems(
        cta.contactIds.map((id: string, i: number) => ({
          contactId: id,
          contactName: cta.contactNames?.[i] ?? '',
          messageBody: cta.messageBody,
        })),
      );
      setSelectedIds(new Set(cta.contactIds));
      setUseCustom(true);
      setMessageSource('queued');
      setCustomBody(cta.messageBody);
      setStatus(`Daily brief: ${cta.label}`);
      initialized.current = true;
      setSearchParams({}, { replace: true });
    } catch {
      /* ignore */
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!loading) applyCtaFromUrl();
  }, [loading, applyCtaFromUrl]);

  useEffect(() => {
    if (loading || mode === 'queued' || templates.length === 0 || contacts.length === 0) return;
    if (initialized.current) return;
    if (variant === 'hub') return;
    const first = templates[0];
    applyTemplate(first);
    initialized.current = true;
  }, [loading, mode, templates, contacts.length, applyTemplate, variant]);

  useEffect(() => {
    if (initialized.current) return;
    const segParam = searchParams.get('segment');
    const seg = segParam
      ? segments.find((s) => s.id === segParam)
      : segments.find((s) => s.count > 0) ?? segments[0];
    if (seg) setSelectedSegmentId(seg.id);
    setWhatTab('claude');
    initialized.current = true;
  }, [variant, loading, segments, contacts.length, searchParams]);

  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (!selectedIds.has(c.id)) return false;
      if (reviewingQueue) return true;
      if (messageSource === 'segment-promo' && activeSegment) {
        return classifyContactForPromo(c, activeSegment).eligible;
      }
      if (messageSource === 'template' && !useCustom && activeTemplate) {
        return classifyContactForTemplate(c, activeTemplate).eligible;
      }
      return true;
    });
  }, [
    contacts,
    selectedIds,
    reviewingQueue,
    messageSource,
    activeSegment,
    useCustom,
    activeTemplate,
    classifyContactForPromo,
    classifyContactForTemplate,
  ]);

  useEffect(() => {
    if (reviewingQueue) return;
    if (messageSource === 'segment-promo' && activeSegment) {
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          const c = contacts.find((x) => x.id === id);
          if (c && classifyContactForPromo(c, activeSegment).eligible) next.add(id);
        }
        return next.size === prev.size ? prev : next;
      });
      return;
    }
    if (messageSource !== 'template' || useCustom || !activeTemplate) return;
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const c = contacts.find((x) => x.id === id);
        if (c && classifyContactForTemplate(c, activeTemplate).eligible) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [reviewingQueue, messageSource, useCustom, activeTemplate, activeSegment, contacts, classifyContactForTemplate, classifyContactForPromo]);

  const messageGroups = useMemo(() => {
    if (!reviewingQueue) return [];
    const items = variant === 'hub' ? displayQueueItems : effectiveQueueItems;
    return groupQueueItems(items, contacts, segmentsById);
  }, [reviewingQueue, variant, displayQueueItems, effectiveQueueItems, contacts, segmentsById]);

  const isABTest = messageGroups.length >= 2;
  const queuedRecipientCount = messageGroups.reduce((n, g) => n + g.recipients.length, 0);

  const segmentContactsWithoutQueue = useMemo(() => {
    if (variant !== 'hub' || !activeSegment || !reviewingQueue) return [];
    const queuedIds = new Set(displayQueueItems.map((q) => q.contactId));
    return activeSegment.contacts
      .map((sc) => contacts.find((c) => c.id === sc.id))
      .filter((c): c is SavedContact => !!c && !queuedIds.has(c.id));
  }, [variant, activeSegment, reviewingQueue, displayQueueItems, contacts]);

  const hubSelectedSendCount = useMemo(() => {
    if (variant !== 'hub' || !reviewingQueue) return selectedContacts.length;
    const queuedIds = new Set(displayQueueItems.map((q) => q.contactId));
    return selectedContacts.filter((c) => queuedIds.has(c.id)).length;
  }, [variant, reviewingQueue, selectedContacts, displayQueueItems]);

  const toggleSendSelection = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const groupKey = messageGroups.map((g) => g.body).join('\0');

  useEffect(() => {
    if (messageGroups.length === 0) return;
    setExpandedGroups(new Set(messageGroups.map((_, i) => i)));
  }, [groupKey, messageGroups.length]);

  const removeFromQueue = async (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });
    if (reviewingQueue) {
      setQueueItems((prev) => prev.filter((q) => q.contactId !== contactId));
      setClaudeDrafts((prev) =>
        prev
          .map((d) => ({
            ...d,
            messages: d.messages.filter((m) => m.contactId !== contactId),
          }))
          .filter((d) => d.messages.length > 0),
      );
      try {
        await fetch(`${API_URL}/api/messages/queue`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds: [contactId] }),
        });
      } catch {
        /* ignore */
      }
    }
  };

  const clearSentFromQueue = async (sentIds: string[]) => {
    if (sentIds.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      sentIds.forEach((id) => next.delete(id));
      return next;
    });
    setQueueItems((prev) => prev.filter((q) => !sentIds.includes(q.contactId)));
    try {
      await fetch(`${API_URL}/api/messages/queue`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: sentIds }),
      });
    } catch {
      /* ignore */
    }
  };

  const toggleGroupExpanded = (index: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const templateMetaForContact = useCallback(
    (contact: SavedContact) => {
      if (reviewingQueue) {
        const q =
          queueItems.find((i) => i.contactId === contact.id) ??
          effectiveQueueItems.find((i) => i.contactId === contact.id);
        if (q?.templateId) {
          return {
            templateId: q.templateId,
            templateName: q.templateName || queueSourceLabel(q),
            campaignType: undefined as string | undefined,
          };
        }
        return {
          templateId: 'queued',
          templateName: queueSourceLabel(q),
          campaignType: undefined as string | undefined,
        };
      }
      if (useCustom || messageSource === 'custom') {
        return { templateId: 'custom', templateName: 'Custom', campaignType: undefined };
      }
      if (messageSource === 'segment-promo' && activeSegment) {
        return {
          templateId: `promo:${activeSegment.campaign.id}`,
          templateName: activeSegment.campaign.name,
          campaignType: undefined,
        };
      }
      return {
        templateId: templateId,
        templateName: activeTemplate?.name ?? 'Message',
        campaignType: activeTemplate?.campaignType ?? undefined,
      };
    },
    [
      reviewingQueue,
      queueItems,
      effectiveQueueItems,
      useCustom,
      messageSource,
      activeSegment,
      templateId,
      activeTemplate,
    ],
  );

  const templateMeta = () => {
    if (reviewingQueue) {
      return {
        templateId: 'queued',
        templateName: queueSourceSummary || 'Queued messages',
        campaignType: undefined,
      };
    }
    if (useCustom || messageSource === 'custom') {
      return { templateId: 'custom', templateName: 'Custom', campaignType: undefined };
    }
    if (messageSource === 'segment-promo' && activeSegment) {
      return {
        templateId: `promo:${activeSegment.campaign.id}`,
        templateName: activeSegment.campaign.name,
        campaignType: undefined,
      };
    }
    return {
      templateId: templateId,
      templateName: activeTemplate?.name ?? 'Message',
      campaignType: activeTemplate?.campaignType ?? undefined,
    };
  };

  const sendViaOpenWA = async (toSend: SavedContact[], _sentAll = false) => {
    const { campaignType } = templateMeta();
    setSending(true);
    setStatus(`Sending to ${toSend.length} customer(s) via OpenWA…`);
    try {
      const res = await fetch(`${API_URL}/api/messages/send-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: toSend.map((c) => {
            const meta = templateMetaForContact(c);
            return {
              contactId: c.id,
              messageBody: bodyFor(c),
              templateId: meta.templateId,
              templateName: meta.templateName,
              customerName: c.name,
              campaignType: meta.campaignType ?? campaignType,
            };
          }),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContacts(data.contacts || []);
        const sentIds = toSend.map((c) => c.id);
        const remainingCount = queueItems.filter((q) => !sentIds.includes(q.contactId)).length;
        if (reviewingQueue) {
          await clearSentFromQueue(sentIds);
          if (remainingCount > 0) {
            showStatus(`Sent to ${data.sent} customer(s) — ${remainingCount} still in queue`, 'success');
          } else {
            setSelectedIds(new Set());
            showStatus(`Sent to ${data.sent} customer(s) 🎉`, 'success');
          }
        } else {
          setSelectedIds(new Set());
          showStatus(`Sent to ${data.sent} customer(s) 🎉`, 'success');
        }
        onSurveyCountsChange?.();
      } else {
        const failed = (data.results as { ok?: boolean; error?: string; name?: string }[] | undefined)?.filter(
          (r) => !r.ok,
        );
        const detail =
          failed?.map((r) => `${r.name || 'Contact'}: ${r.error}`).join(' · ') ||
          data.error ||
          'Send failed';
        showStatus(detail, 'error');
      }
    } catch {
      showStatus('Cannot reach server.', 'error');
    }
    setSending(false);
  };

  const startWizard = (toSend: SavedContact[], sentAll = false) => {
    if (toSend.length === 0) {
      showStatus('No recipients selected.', 'error');
      return;
    }

    const phoneIssues = toSend
      .map((c) => ({ name: c.name, warning: getPhoneValidationWarning(c.phone) }))
      .filter((x) => x.warning);
    if (phoneIssues.length > 0) {
      showStatus(`${phoneIssues[0].name}: ${phoneIssues[0].warning}`, 'error');
      return;
    }

    const { templateId: tid, templateName, campaignType } = templateMeta();
    const blocked = toSend
      .map((c) => {
        const meta = templateMetaForContact(c);
        return duplicateBlockReason(c, bodyFor(c), meta.templateId);
      })
      .filter((msg): msg is string => !!msg);

    if (blocked.length === toSend.length) {
      showStatus(blocked[0], 'error');
      return;
    }
    if (blocked.length > 0) {
      showStatus(`${blocked.length} skipped (already sent). Sending to the rest…`, 'info');
    }

    const allowed = toSend.filter((c) => {
      const meta = templateMetaForContact(c);
      return !duplicateBlockReason(c, bodyFor(c), meta.templateId);
    });
    if (allowed.length === 0) return;

    if (openwaEnabled && allowed.length > 1) {
      sendViaOpenWA(allowed, sentAll);
      return;
    }
    setWizard({ contacts: allowed, index: 0, templateId: tid, templateName, sentAll, campaignType });
  };

  const sendOneOpenWA = async (contact: SavedContact) => {
    if (!wizard) return false;
    const meta = reviewingQueue
      ? templateMetaForContact(contact)
      : {
          templateId: wizard.templateId,
          templateName: wizard.templateName,
          campaignType: wizard.campaignType,
        };
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          messageBody: bodyFor(contact),
          templateId: meta.templateId,
          templateName: meta.templateName,
          customerName: contact.name,
          campaignType: meta.campaignType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showStatus(data.error || 'Send failed', 'error');
        setSending(false);
        return false;
      }
      await loadContacts();
      setSending(false);
      return true;
    } catch {
      showStatus('Cannot reach server.', 'error');
      setSending(false);
      return false;
    }
  };

  const markSentAndNext = async () => {
    if (!wizard) return;
    const contact = wizard.contacts[wizard.index];
    const message = fillTemplate(bodyFor(contact), contact.name);
    const logMeta = reviewingQueue
      ? templateMetaForContact(contact)
      : { templateId: wizard.templateId, templateName: wizard.templateName };

    if (openwaEnabled) {
      if (!(await sendOneOpenWA(contact))) return;
    } else {
      try {
        await fetch(`${API_URL}/api/messages/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: contact.id,
            templateId: logMeta.templateId,
            templateName: logMeta.templateName,
            messageBody: message,
          }),
        });
        await loadContacts();
      } catch {
        setStatus('Could not save sent status.');
        return;
      }
    }

    const next = wizard.index + 1;
    if (next >= wizard.contacts.length) {
      const sentIds = wizard.contacts.map((c) => c.id);
      const remainingCount = queueItems.filter((q) => !sentIds.includes(q.contactId)).length;
      setWizard(null);
      if (reviewingQueue) {
        await clearSentFromQueue(sentIds);
        if (remainingCount > 0) {
          setStatus(`Done — sent to ${wizard.contacts.length}. ${remainingCount} still in queue.`);
        } else {
          setSelectedIds(new Set());
          setStatus(`Done — sent to ${wizard.contacts.length}.`);
        }
      } else {
        setSelectedIds(new Set());
        setStatus(`Done — sent to ${wizard.contacts.length}.`);
      }
      return;
    }
    setWizard({ ...wizard, index: next });
  };

  const adjustList = contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const adjustReady =
    messageSource === 'segment-promo' && activeSegment
      ? adjustList.filter((c) => classifyContactForPromo(c, activeSegment).eligible)
      : messageSource === 'template' && !useCustom && activeTemplate
        ? adjustList.filter((c) => classifyContactForTemplate(c, activeTemplate).eligible)
        : adjustList;

  const adjustAlreadySent =
    messageSource === 'segment-promo' && activeSegment
      ? adjustList
          .filter((c) => !classifyContactForPromo(c, activeSegment).eligible)
          .map((c) => {
            const cl = classifyContactForPromo(c, activeSegment);
            return { contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt };
          })
      : messageSource === 'template' && !useCustom && activeTemplate
        ? adjustList
            .filter((c) => !classifyContactForTemplate(c, activeTemplate).eligible)
            .map((c) => {
              const cl = classifyContactForTemplate(c, activeTemplate);
              return { contact: c, reason: cl.reason || 'Not eligible', sentAt: cl.sentAt };
            })
        : [];

  const formatSentWhen = (sentAt?: string) => {
    if (!sentAt) return '';
    const d = sentAt.replace(' ', 'T') + 'Z';
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return sentAt.slice(0, 10);
    }
  };

  const showCompose = variant === 'full' || variant === 'compose' || variant === 'hub';
  const showSend = variant === 'full' || variant === 'queue' || variant === 'compose' || variant === 'hub';
  const embedded = variant !== 'full';

  const stageToQueue = async () => {
    if (selectedContacts.length === 0) {
      showStatus('Select at least one recipient.', 'error');
      return;
    }
    const { templateId: tid, templateName } = templateMeta();
    try {
      const items = selectedContacts.map((c) => ({
        contactId: c.id,
        body: bodyFor(c),
        templateId: tid,
        templateName,
      }));
      const res = await fetch(`${API_URL}/api/messages/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(
          `Staged ${data.queued?.length ?? selectedContacts.length} message(s) — open Queue to send`,
          'success',
        );
        navigate('/customers/queue?tab=promo');
      } else {
        showStatus(data.error || 'Could not stage messages', 'error');
      }
    } catch {
      showStatus('Cannot reach server.', 'error');
    }
  };

  const draftFromAi = async () => {
    setDrafting(true);
    setServerDraftPreview([]);
    showStatus('Server is drafting preview (lucaVoice fallback) — nothing queued yet…', 'info');
    try {
      const payload: { segmentId?: string; autoQueue: boolean } = { autoQueue: false };
      if (selectedSegmentId) payload.segmentId = selectedSegmentId;
      const res = await fetch(`${API_URL}/api/ai/draft-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        showStatus(String(data.error || 'Claude draft failed'), 'error');
        return;
      }
      const count = applyClaudeDraftPreview(data as { drafts?: ClaudeDraftGroup[] });
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      if (count === 0) {
        showStatus(
          String(data.summary || 'No eligible contacts to draft right now'),
          'info',
        );
        return;
      }
      setHubMode('manual');
      setWhatTab('templates');
      showStatus(
        `${String(data.summary || `Preview: ${count} server draft(s)`)}${skipped ? ` · ${skipped} skipped` : ''} — click Stage to queue (MCP messages are kept)`,
        'success',
      );
    } catch (err) {
      showStatus(apiUnreachableMessage(err), 'error');
    } finally {
      setDrafting(false);
    }
  };

  const stageServerDrafts = async () => {
    if (serverDraftItems.length === 0) {
      showStatus('Draft a preview first.', 'error');
      return;
    }
    const mcpInQueue = queueItems.filter(
      (q) =>
        q.templateName?.includes('Composed by Claude') ||
        (q.templateId?.startsWith('claude:') && !q.templateName?.startsWith('Claude ·')),
    ).length;
    const ok = window.confirm(
      `Stage ${serverDraftItems.length} server draft(s) to the queue?` +
        (mcpInQueue > 0
          ? ` ${mcpInQueue} MCP-composed message(s) already in queue will be kept.`
          : ''),
    );
    if (!ok) return;
    setStagingDrafts(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/draft-messages/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: serverDraftItems }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        showStatus(String(data.error || 'Could not stage drafts'), 'error');
        return;
      }
      const mcpSkipped = Array.isArray(data.skipped)
        ? data.skipped.filter((s: { reason?: string }) => s.reason === 'mcp_pending').length
        : 0;
      const staged = Array.isArray(data.queued) ? data.queued.length : 0;
      await reloadQueueFromApi();
      setServerDraftPreview([]);
      showStatus(
        `Staged ${staged} draft(s)${mcpSkipped ? ` · ${mcpSkipped} kept MCP message(s)` : ''} — review in Send`,
        'success',
      );
    } catch (err) {
      showStatus(apiUnreachableMessage(err), 'error');
    } finally {
      setStagingDrafts(false);
    }
  };

  const primaryAction = (toSend: SavedContact[], sentAll = false) => {
    if (variant === 'compose' && mode === 'template') {
      void stageToQueue();
      return;
    }
    startWizard(toSend, sentAll);
  };

  const inner = (
    <div className={embedded ? 'space-y-4' : `max-w-6xl mx-auto px-4 py-6 sm:px-8 ${selectedContacts.length > 0 ? 'pb-28 lg:pb-8' : ''}`}>
        {variant === 'compose' && (
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              onClick={draftFromAi}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-mediterranean-700 text-white hover:bg-mediterranean-800"
            >
              Preview draft (lucaVoice)
            </button>
            {serverDraftItems.length > 0 && (
              <button
                type="button"
                onClick={stageServerDrafts}
                disabled={stagingDrafts}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-mediterranean-700 text-mediterranean-900 bg-white hover:bg-mediterranean-50"
              >
                Stage {serverDraftItems.length} to queue
              </button>
            )}
          </div>
        )}
        {status && (
          <p
            className={`text-sm flex items-start gap-2 rounded-lg border px-4 py-3 mb-4 ${
              statusKind === 'error'
                ? 'bg-amber-50 border-amber-400 text-amber-950'
                : statusKind === 'success'
                  ? 'bg-green-50 border-green-300 text-green-900'
                  : 'bg-white border-beige-600 text-ink-600'
            }`}
            role={statusKind === 'error' ? 'alert' : 'status'}
          >
            {statusKind === 'error' ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2
                className={`w-5 h-5 shrink-0 ${statusKind === 'success' ? 'text-green-600' : 'text-mediterranean-600'}`}
              />
            )}
            <span className="flex-1">{status}</span>
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-mediterranean-700" />
          </div>
        ) : (
          <>
          {variant === 'hub' && (
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => switchHubMode('claude')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${
                    hubMode === 'claude'
                      ? 'border-mediterranean-600 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                      : 'border-beige-600 bg-white hover:bg-cream-400'
                  }`}
                >
                  <p className="font-semibold text-ink-900">Claude (MCP)</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Personalized messages from <code>message_queue</code> — composed outside the app
                  </p>
                  {hasQueuedMessages && (
                    <p className="text-xs font-medium text-mediterranean-800 mt-2">
                      {effectiveQueueItems.length} total queued
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => switchHubMode('manual')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${
                    hubMode === 'manual'
                      ? 'border-mediterranean-600 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                      : 'border-beige-600 bg-white hover:bg-cream-400'
                  }`}
                >
                  <p className="font-semibold text-ink-900">Manual</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Template, static segment promo, or your own text — for the segment in Who
                  </p>
                </button>
              </div>

              {hubManualMode && (
                <div className="rounded-xl border border-beige-600 bg-white p-4 space-y-4 shadow-sm">
                  <p className="text-sm text-ink-700">
                    Manual mode for{' '}
                    <strong>{activeSegment?.name ?? '— pick a segment in Who →'}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['templates', 'segment', 'custom'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          if (!activeSegment) {
                            showStatus('Pick a segment in Who first', 'info');
                            return;
                          }
                          if (tab === 'custom') {
                            applyManualCustom(activeSegment);
                          } else if (tab === 'segment') {
                            applyManualStaticPromo(activeSegment);
                          } else {
                            setWhatTab('templates');
                            const t = pickOnboardingTemplate(templates);
                            if (t && activeSegment) applyTemplateForSegment(t, activeSegment);
                          }
                        }}
                        className={`text-sm font-semibold px-4 py-2 rounded-full border ${
                          whatTab === tab
                            ? 'bg-ink-800 text-white border-ink-800'
                            : 'bg-white text-ink-600 border-beige-600 hover:bg-cream-400'
                        }`}
                      >
                        {tab === 'segment' ? 'Static promo' : tab === 'templates' ? 'Templates' : 'Custom'}
                      </button>
                    ))}
                  </div>

                  {whatTab === 'custom' && (
                    <textarea
                      value={customBody}
                      onChange={(e) => {
                        setCustomBody(e.target.value);
                        setUseCustom(true);
                        setMessageSource('custom');
                      }}
                      rows={5}
                      placeholder="Write your WhatsApp message…"
                      className="w-full px-3 py-2 border border-beige-600 rounded-xl text-sm font-sans leading-relaxed"
                    />
                  )}

                  {whatTab === 'segment' && activeSegment && (
                    <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400/50 rounded-lg p-3 border border-beige-500 max-h-32 overflow-y-auto">
                      {activeSegment.campaign.body.replace(/\{\{firstName\}\}/g, '[Name]')}
                    </pre>
                  )}

                  {whatTab === 'templates' && (
                    <div className="space-y-3">
                      <p className="text-xs text-mediterranean-900 bg-mediterranean-50 border border-mediterranean-200 rounded-lg px-3 py-2">
                        <strong>Auto:</strong> new first orders get this intro + 5-option poll ~2h after
                        delivery — expand <strong>First-order onboarding</strong> above. Manual here is for
                        one-off resends to a segment.
                      </p>
                      {hubTemplateGroups.onboarding && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeSegment) {
                              showStatus('Pick a segment in Who first', 'info');
                              return;
                            }
                            applyTemplateForSegment(hubTemplateGroups.onboarding!, activeSegment);
                          }}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                            templateId === hubTemplateGroups.onboarding.id
                              ? 'border-mediterranean-600 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                              : 'border-mediterranean-400 bg-mediterranean-50/60 hover:bg-mediterranean-50'
                          }`}
                        >
                          <p className="font-semibold text-ink-900">{hubTemplateGroups.onboarding.name}</p>
                          <p className="text-xs text-ink-600 mt-1">{hubTemplateGroups.onboarding.description}</p>
                          <p className="text-[11px] font-semibold text-mediterranean-900 mt-2 inline-block px-2 py-0.5 rounded-full bg-mediterranean-100">
                            First-order onboarding · intro + {PREFERENCE_POLL_OPTIONS.length}-option poll
                          </p>
                        </button>
                      )}
                      {templateId === PREFERENCE_POLL_TEMPLATE_ID && (
                        <div className="rounded-xl border border-mediterranean-200 bg-white p-4">
                          <p className="text-xs font-semibold text-mediterranean-900 uppercase tracking-wide mb-2">
                            Message preview
                          </p>
                          <pre className="text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400/50 rounded-lg p-3 border border-beige-400 max-h-48 overflow-y-auto">
                            {fillTemplate(
                              hubTemplateGroups.onboarding?.body || ONBOARDING_INTRO_BODY,
                              'Marco',
                            )}
                          </pre>
                          <p className="text-xs text-ink-500 mt-2">
                            OpenWA send adds the 5-option preference poll after this intro.
                          </p>
                          {pendingManual.length > 0 &&
                            activeSegment?.id !== ONBOARDING_PENDING_SEGMENT_ID && (
                              <button
                                type="button"
                                onClick={() => {
                                  const seg = segmentsForWho.find(
                                    (s) => s.id === ONBOARDING_PENDING_SEGMENT_ID,
                                  );
                                  if (seg) applySegment(seg);
                                }}
                                className="mt-3 text-xs font-semibold text-mediterranean-800 underline"
                              >
                                Switch to New orders — today &amp; yesterday ({pendingManual.length}{' '}
                                waiting)
                              </button>
                            )}
                        </div>
                      )}
                      {hubTemplateGroups.other.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {hubTemplateGroups.other.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                if (!activeSegment) {
                                  showStatus('Pick a segment in Who first', 'info');
                                  return;
                                }
                                applyTemplateForSegment(t, activeSegment);
                              }}
                              className={`text-left p-3 rounded-lg border text-sm ${
                                templateId === t.id
                                  ? 'border-mediterranean-500 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                                  : 'border-beige-500 bg-white hover:bg-cream-400'
                              }`}
                            >
                              <p className="font-semibold text-ink-900">{t.name}</p>
                              <p className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{t.description}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {hubTemplateGroups.legacy.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-ink-500 py-1">
                            Older one-off templates ({hubTemplateGroups.legacy.length}) — not the auto onboarding
                          </summary>
                          <div className="grid gap-2 sm:grid-cols-2 mt-2">
                            {hubTemplateGroups.legacy.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  if (!activeSegment) {
                                    showStatus('Pick a segment in Who first', 'info');
                                    return;
                                  }
                                  applyTemplateForSegment(t, activeSegment);
                                }}
                                className={`text-left p-3 rounded-lg border text-sm opacity-90 ${
                                  templateId === t.id
                                    ? 'border-beige-600 bg-cream-400'
                                    : 'border-beige-500 bg-white hover:bg-cream-400'
                                }`}
                              >
                                <p className="font-semibold text-ink-800">{t.name}</p>
                                <p className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{t.description}</p>
                              </button>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  <details className="text-xs text-ink-500">
                    <summary className="cursor-pointer font-medium text-mediterranean-800">
                      Server auto-draft (lucaVoice) — optional
                    </summary>
                    <div className="mt-2 space-y-2">
                      <button
                        type="button"
                        onClick={draftFromAi}
                        disabled={drafting || stagingDrafts}
                        className="text-sm font-medium px-3 py-2 rounded-lg border border-mediterranean-700 text-mediterranean-900 bg-white hover:bg-mediterranean-50 w-full disabled:opacity-60"
                      >
                        {drafting ? 'Drafting…' : `Preview server draft${activeSegment ? ` for ${activeSegment.name}` : ''}`}
                      </button>
                      {serverDraftPreview.length > 0 && (
                        <button
                          type="button"
                          onClick={stageServerDrafts}
                          disabled={stagingDrafts}
                          className="text-sm font-medium px-3 py-2 rounded-lg bg-mediterranean-800 text-white w-full disabled:opacity-60"
                        >
                          {stagingDrafts ? 'Staging…' : `Stage ${serverDraftItems.length} to Claude queue`}
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
          <div
            className={
              variant === 'hub'
                ? 'lg:grid lg:grid-cols-3 lg:gap-6'
                : showCompose && showSend
                  ? 'lg:grid lg:grid-cols-2 lg:gap-8'
                  : ''
            }
          >
            {variant === 'hub' && (
              <section className="space-y-3 lg:order-1">
                <h2 className="font-display text-lg text-ink-900">Who</h2>
                <p className="text-xs text-ink-500">
                  Pick a segment — Send and What update to that segment&apos;s people and message.
                </p>
                <div className="space-y-2">
                  {segmentsForWho.map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => applySegment(seg)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        selectedSegmentId === seg.id
                          ? seg.id === ONBOARDING_PENDING_SEGMENT_ID
                            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                            : 'border-mediterranean-500 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                          : seg.id === ONBOARDING_PENDING_SEGMENT_ID
                            ? 'border-amber-300 bg-amber-50/60 hover:bg-amber-50'
                            : 'border-beige-600 bg-white hover:bg-cream-400'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-ink-900">{seg.name}</p>
                          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{seg.who}</p>
                          <p className="text-[10px] text-mediterranean-800 mt-1.5 font-medium">
                            {hubMode === 'claude'
                              ? `${seg.count} in segment · ${queuedCountBySegment.get(seg.id) ?? 0} queued`
                              : `${seg.count} in segment`}
                          </p>
                        </div>
                        <span className="text-lg font-display text-mediterranean-800 shrink-0">
                          {seg.count}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <Link
                  to="/customers/segments"
                  className="text-xs font-medium text-mediterranean-700 underline"
                >
                  Segment definitions →
                </Link>
              </section>
            )}

            {/* LEFT / WHAT — templates & message */}
            {showCompose && (
            <section className={`space-y-3 ${variant === 'hub' ? 'lg:order-3' : ''} ${variant !== 'hub' && mode === 'queued' ? 'lg:opacity-80' : ''}`}>
              {variant === 'hub' ? (
                <>
                  <h2 className="font-display text-lg text-ink-900">What</h2>
                  <p className="text-xs text-ink-500">
                    {hubManualMode
                      ? 'One message preview — name changes per person. Pick who to send in Send.'
                      : 'Claude queue for the selected segment — read-only, matches database.'}
                  </p>

                  {hubManualMode ? (
                    <>
                      <p className="text-sm font-semibold text-ink-800">
                        {activeSegment?.name ?? 'Pick a segment'}
                        {whatTab === 'templates' && activeTemplate
                          ? ` · ${activeTemplate.name}`
                          : whatTab === 'segment'
                            ? ' · Static promo'
                            : whatTab === 'custom'
                              ? ' · Custom'
                              : ''}
                      </p>
                      {manualAudienceEmpty ? (
                        <div className="rounded-xl border border-dashed border-beige-500 bg-cream-400/40 p-6 text-center text-sm text-ink-500 space-y-3">
                          {whatTab === 'templates' && templateId === PREFERENCE_POLL_TEMPLATE_ID && (
                            <pre className="text-left text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-white rounded-lg p-3 border border-beige-400 max-h-40 overflow-y-auto">
                              {fillTemplate(
                                hubTemplateGroups.onboarding?.body || ONBOARDING_INTRO_BODY,
                                'Marco',
                              )}
                            </pre>
                          )}
                          <p>
                            {activeSegment
                              ? `No eligible customers in “${activeSegment.name}” for this message (already sent or wrong segment).`
                              : 'Pick a segment in Who, then choose Neighbourhood Welcome above.'}
                          </p>
                          {pendingManual.length > 0 &&
                            activeSegment?.id !== ONBOARDING_PENDING_SEGMENT_ID && (
                              <button
                                type="button"
                                onClick={() => {
                                  const seg = segmentsForWho.find(
                                    (s) => s.id === ONBOARDING_PENDING_SEGMENT_ID,
                                  );
                                  if (seg) applySegment(seg);
                                }}
                                className="text-mediterranean-800 font-semibold underline"
                              >
                                Use New orders — today &amp; yesterday ({pendingManual.length})
                              </button>
                            )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-mediterranean-200 bg-white p-4 shadow-sm">
                            <p className="text-xs font-semibold text-mediterranean-900 uppercase tracking-wide mb-2">
                              Message preview
                            </p>
                            <pre className="text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400/50 rounded-lg p-3 border border-beige-400 max-h-[50vh] overflow-y-auto">
                              {previewBody(
                                recipientSplit.ready[0] ??
                                  ({ name: 'Marco', id: '', phone: '', sentMessages: [] } as SavedContact),
                              )}
                            </pre>
                            {templateId === PREFERENCE_POLL_TEMPLATE_ID && (
                              <p className="text-xs text-ink-500 mt-2">
                                OpenWA send adds the 5-option preference poll after this intro.
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-ink-500">
                            {recipientSplit.ready.length} eligible in{' '}
                            <strong>{activeSegment?.name ?? 'segment'}</strong> — same text for everyone,
                            only the name changes. Select recipients in Send →
                          </p>
                        </div>
                      )}
                    </>
                  ) : displayQueueItems.length > 0 ? (
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto">
                      {displayQueueItems.map((item) => {
                        const contact = contacts.find((c) => c.id === item.contactId);
                        if (!contact) return null;
                        return (
                          <div
                            key={item.contactId}
                            className="rounded-xl border border-mediterranean-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <p className="text-sm font-semibold text-ink-900">{contact.name}</p>
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-mediterranean-800 text-white">
                                {queueSourceLabel(item)}
                              </span>
                            </div>
                            <p className="text-xs font-mono text-ink-500 mb-2">{contact.phone}</p>
                            <pre className="text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-mediterranean-50/50 rounded-lg p-3 border border-beige-400">
                              {item.messageBody.replace(/\{\{firstName\}\}/g, '[Name]')}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-mediterranean-300 bg-mediterranean-50/40 p-6 text-sm text-ink-600 text-center">
                      <p className="font-medium text-mediterranean-900">
                        {activeSegment
                          ? `No Claude messages queued for “${activeSegment.name}”`
                          : 'No messages in queue'}
                      </p>
                      <p className="text-xs mt-2">
                        Ask Claude to <code>queue_personalized_messages</code> for this segment, or switch to
                        Manual mode.
                      </p>
                    </div>
                  )}
                </>
              ) : mode === 'queued' ? (
                <>
                  <div className="rounded-xl border-2 border-dashed border-mediterranean-300 bg-cream-400/80 p-4 text-center lg:text-left">
                    <p className="text-sm font-semibold text-mediterranean-900">
                      Queued campaign → review on the right
                    </p>
                    <p className="text-xs text-ink-600 mt-1">
                      Claude staged these messages. Send from the right panel — not from the list below.
                    </p>
                  </div>
                  <div className="border-t border-beige-600 pt-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                      Start a new message
                    </h2>
                    <p className="text-xs text-ink-400 mb-3">
                      Fallback options below — they never clear the MCP queue.
                    </p>
                  </div>
                </>
              ) : (
                <h2 className="font-display text-lg text-ink-900">1. Pick message</h2>
              )}

              {variant !== 'hub' && (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      whatTab === 'templates' && !useCustom && templateId === t.id
                        ? 'border-mediterranean-500 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                        : 'border-beige-600 bg-white hover:bg-cream-400'
                    }`}
                  >
                    <p className="font-semibold text-ink-900">{t.name}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{t.description}</p>
                    {t.id === PREFERENCE_POLL_TEMPLATE_ID && (
                      <p className="text-xs font-medium text-mediterranean-800 mt-1.5 bg-mediterranean-100 inline-block px-2 py-0.5 rounded-full">
                        Sends intro + preference poll (Choose 👇)
                      </p>
                    )}
                    {t.targetSegment && segmentsById[t.targetSegment] && (
                      <p className="text-xs text-mediterranean-700 mt-1">
                        → {segmentsById[t.targetSegment].name}
                      </p>
                    )}
                    {t.targetSegment === 'first-time' && (
                      <p className="text-xs text-mediterranean-700 mt-1">→ First-time customers</p>
                    )}
                  </button>
                ))}
              </div>
              )}

              {variant !== 'hub' && (
              <>
              <button
                type="button"
                onClick={() => setShowAdjust((v) => !v)}
                className="text-sm text-mediterranean-700 font-medium flex items-center gap-1 mt-2"
              >
                {showAdjust ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Adjust recipients manually
              </button>
              {showAdjust && (
                <div className="bg-white rounded-xl border border-beige-600 p-4 space-y-3">
                  <input
                    type="search"
                    value={search}
                    placeholder="Search…"
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQueueItems([]);
                        setSelectedIds(new Set(adjustReady.map((c) => c.id)));
                      }}
                      className="text-xs font-medium text-mediterranean-700 border border-mediterranean-300 px-3 py-1.5 rounded-lg hover:bg-mediterranean-50"
                    >
                      Select all ready{search.trim() ? ` (${adjustReady.length})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQueueItems([]);
                        setSelectedIds(new Set());
                      }}
                      className="text-xs font-medium text-ink-600 border border-beige-600 px-3 py-1.5 rounded-lg hover:bg-cream-400"
                    >
                      Deselect all
                    </button>
                    <span className="text-xs text-ink-500 ml-auto">
                      {selectedIds.size} selected
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {adjustReady.length === 0 && adjustAlreadySent.length > 0 && (
                      <p className="text-xs text-ink-500 px-2 py-3 text-center">
                        Everyone in this list already received this message.
                      </p>
                    )}
                    {adjustReady.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-cream-400 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => {
                            setQueueItems([]);
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            });
                          }}
                          className="accent-mediterranean-700"
                        />
                        <span className="truncate">{c.name}</span>
                        {isMessageDedupExemptPhone(c.phone) && (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                            test
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {adjustAlreadySent.length > 0 && (
                    <div className="border-t border-beige-500 pt-3 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 px-2">
                        Already sent — not selectable ({adjustAlreadySent.length})
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {adjustAlreadySent.map(({ contact: c, reason, sentAt }) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 p-2 rounded bg-ink-50 text-sm opacity-75"
                          >
                            <input type="checkbox" checked disabled className="opacity-40" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-ink-600">{c.name}</p>
                              <p className="text-[10px] text-ink-400">
                                {reason}
                                {sentAt ? ` · ${formatSentWhen(sentAt)}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </section>
            )}

            {/* CENTER — Send */}
            {showSend && (
            <section className={`mt-8 lg:mt-0 ${variant === 'hub' ? 'lg:order-2' : reviewingQueue ? 'lg:order-first' : ''}`}>
              <div
                className={`lg:sticky lg:top-4 bg-white rounded-xl border p-5 shadow-sm ${
                  reviewingQueue
                    ? 'border-mediterranean-700 ring-2 ring-mediterranean-200'
                    : hubManualMode
                      ? 'border-amber-400 ring-2 ring-amber-100'
                      : 'border-beige-600'
                }`}
              >
                <h2 className="font-display text-lg text-ink-900 mb-1">
                  {variant === 'hub'
                    ? hubManualMode
                      ? 'Send — Manual'
                      : 'Send — Claude (MCP)'
                    : variant === 'compose'
                      ? 'Review & add to queue'
                      : reviewingQueue
                        ? 'Queued campaign — review & send'
                        : 'Review & send'}
                </h2>

                {hubManualMode && activeSegment && (
                  <p className="text-sm font-semibold text-ink-800 mb-2">
                    {activeSegment.name}
                    {whatTab === 'templates' && activeTemplate
                      ? ` · ${activeTemplate.name}`
                      : whatTab === 'segment'
                        ? ' · Static promo'
                        : ' · Custom'}
                    {' · '}
                    {selectedContacts.length} of {manualSendReady.length} selected
                  </p>
                )}

                {hubManualMode && lucaTestContact && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    <strong>Luca</strong> is always first in the list — send to him to test, then tick
                    customers.
                  </p>
                )}

                {reviewingQueue && activeSegment && (
                  <p className="text-sm font-semibold text-ink-800 mb-2">
                    {activeSegment.name} · {displayQueueItems.length} of {activeSegment.count} have
                    Claude messages
                  </p>
                )}

                <p className="text-xs text-ink-500 mb-4">
                  {reviewingQueue
                    ? `${queueSourceSummary || 'Queued'} — send manually via OpenWA.`
                    : hubManualMode
                      ? 'Tick who to send — message text is in What → on the right.'
                      : variant === 'hub'
                        ? 'Pick Claude or Manual mode above.'
                        : `Skips anyone already sent this message or messaged in the last ${MIN_DAYS_BETWEEN_MESSAGES} days`}
                </p>

                {!useCustom && templateId === PREFERENCE_POLL_TEMPLATE_ID && selectedContacts.length > 0 && (
                  <p className="text-xs text-mediterranean-900 bg-mediterranean-50 border border-mediterranean-200 rounded-lg px-3 py-2 mb-4">
                    Sends the welcome note from What →, then a WhatsApp poll with 5 preference options.
                  </p>
                )}

                {reviewingQueue && variant === 'hub' && displayQueueItems.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <p className="text-sm font-medium text-ink-800">
                        {hubSelectedSendCount} of {displayQueueItems.length} selected to send
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIds(new Set(displayQueueItems.map((q) => q.contactId)))
                        }
                        className="text-xs font-medium text-mediterranean-700 border border-mediterranean-300 px-2.5 py-1 rounded-lg hover:bg-mediterranean-50"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs font-medium text-ink-600 border border-beige-600 px-2.5 py-1 rounded-lg hover:bg-cream-400"
                      >
                        Deselect all
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[55vh] overflow-y-auto mb-4">
                      {displayQueueItems.map((item) => {
                        const contact = contacts.find((c) => c.id === item.contactId);
                        if (!contact) return null;
                        const checked = selectedIds.has(contact.id);
                        return (
                          <div
                            key={item.contactId}
                            className={`rounded-xl border p-4 transition-colors ${
                              checked
                                ? 'border-mediterranean-300 bg-mediterranean-50/40'
                                : 'border-beige-500 bg-ink-50/40 opacity-80'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSendSelection(contact.id)}
                                className="mt-1 accent-mediterranean-700 shrink-0"
                                aria-label={`Include ${contact.name}`}
                              />
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-ink-900 text-sm flex items-center gap-1.5 flex-wrap">
                                      {contact.name}
                                      <MessagePrefChip pref={contact.message_pref} />
                                    </p>
                                    <p className="text-xs font-mono text-ink-500">{contact.phone}</p>
                                  </div>
                                  {checked && (
                                    <button
                                      type="button"
                                      onClick={() => primaryAction([contact], false)}
                                      disabled={sending}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:bg-[#1fb855] disabled:opacity-60 shrink-0"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      Send
                                    </button>
                                  )}
                                </div>
                                <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-white/70 rounded-lg p-3 border border-beige-400">
                                  {fillTemplate(item.messageBody, contact.name)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {segmentContactsWithoutQueue.length > 0 && (
                      <div className="mb-4 rounded-lg border border-dashed border-ink-300 bg-ink-50/80 p-3">
                        <p className="text-xs font-semibold text-ink-700">
                          In segment, no Claude message yet ({segmentContactsWithoutQueue.length})
                        </p>
                        <p className="text-[11px] text-ink-500 mt-1">
                          Claude has not queued for these people yet — ask it to{' '}
                          <code>queue_personalized_messages</code> for{' '}
                          <code>{activeSegment?.id}</code>.
                        </p>
                        <ul className="mt-2 space-y-1">
                          {segmentContactsWithoutQueue.map((c) => (
                            <li key={c.id} className="text-sm text-ink-600">
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const queuedIds = new Set(displayQueueItems.map((q) => q.contactId));
                        const toSend = selectedContacts.filter((c) => queuedIds.has(c.id));
                        primaryAction(toSend, toSend.length === displayQueueItems.length);
                      }}
                      disabled={sending || hubSelectedSendCount === 0}
                      className="w-full flex items-center justify-center gap-2 bg-mediterranean-800 hover:bg-mediterranean-900 text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <MessageCircle className="w-6 h-6" />
                      )}
                      {openwaEnabled
                        ? `Send selected via OpenWA (${hubSelectedSendCount})`
                        : `Send selected (${hubSelectedSendCount})`}
                    </button>
                  </>
                ) : manualAudienceEmpty || (!hubManualMode && selectedContacts.length === 0) ? (
                  <p className="text-sm text-ink-500 py-8 text-center">
                    {reviewingQueue
                      ? activeSegment
                        ? `No Claude messages queued for “${activeSegment.name}”.`
                        : 'Pick a segment in Who.'
                      : hubManualMode
                        ? activeSegment
                          ? 'No eligible customers in this segment — try another template or segment.'
                          : 'Pick a segment in Who, then choose Template / Static promo / Custom above.'
                        : variant === 'hub'
                          ? 'Select Claude or Manual mode above.'
                          : 'Pick a message on the left — recipients appear here automatically'}
                  </p>
                ) : reviewingQueue && messageGroups.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <p className="text-sm font-medium text-ink-800">
                        {queuedRecipientCount} recipient{queuedRecipientCount !== 1 ? 's' : ''} ·{' '}
                        {messageGroups.length} message variant{messageGroups.length !== 1 ? 's' : ''}
                      </p>
                      {isABTest && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                          A/B test
                        </span>
                      )}
                    </div>

                    <div className="space-y-4 max-h-[55vh] overflow-y-auto mb-4">
                      {messageGroups.map((group, groupIndex) => {
                        const accent = VARIANT_ACCENTS[groupIndex % VARIANT_ACCENTS.length];
                        const label = group.groupLabel || variantLabel(groupIndex);
                        const expanded = expandedGroups.has(groupIndex);
                        const previewName = group.recipients[0]?.name ?? 'Customer';

                        return (
                          <div
                            key={group.body.slice(0, 40) + groupIndex}
                            className={`rounded-xl border-2 ${accent.border} ${accent.bg} overflow-hidden`}
                          >
                            <div className="p-4 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <span
                                    className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${accent.badge}`}
                                  >
                                    {group.sourceLabel}
                                  </span>
                                  <p className={`text-sm font-semibold mt-1.5 ${accent.header}`}>
                                    {label} · {group.recipients.length} recipient
                                    {group.recipients.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => primaryAction(group.recipients, false)}
                                  disabled={sending}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:bg-[#1fb855] disabled:opacity-60 shrink-0"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Send {group.perRecipient ? 'message' : label}
                                </button>
                              </div>

                              <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-white/60 rounded-lg p-3 border border-white/80">
                                {group.perRecipient && group.items.length === 1
                                  ? fillTemplate(group.items[0].messageBody, previewName)
                                  : fillTemplate(group.body, previewName)}
                              </pre>

                              <button
                                type="button"
                                onClick={() => toggleGroupExpanded(groupIndex)}
                                className="text-xs text-ink-600 font-medium flex items-center gap-1"
                              >
                                {expanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                {expanded ? 'Hide' : 'Show'} recipients ({group.recipients.length})
                              </button>

                              {expanded && (
                                <div className="space-y-1.5 pt-1 border-t border-black/5">
                                  {group.recipients.map((contact) => (
                                    <div
                                      key={contact.id}
                                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white/70"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-ink-900 truncate flex items-center gap-1.5 flex-wrap">
                                          {contact.name}
                                          <MessagePrefChip pref={contact.message_pref} />
                                        </p>
                                        <p className="text-xs font-mono text-ink-500 truncate">
                                          {contact.phone}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeFromQueue(contact.id)}
                                        className="p-1 text-ink-400 hover:text-ink-700 shrink-0"
                                        aria-label={`Remove ${contact.name}`}
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => primaryAction(selectedContacts, true)}
                      disabled={sending}
                      className="w-full flex items-center justify-center gap-2 bg-mediterranean-800 hover:bg-mediterranean-900 text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <MessageCircle className="w-6 h-6" />
                      )}
                      {openwaEnabled
                        ? `Send all via OpenWA (${queuedRecipientCount})`
                        : `Send all (${queuedRecipientCount})`}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <p className="text-sm font-medium text-ink-800">
                        {hubManualMode
                          ? `${selectedContacts.length} of ${manualSendReady.length} selected to send`
                          : `${selectedContacts.length} ready to send`}
                      </p>
                      {hubManualMode && manualSendReady.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIds(new Set(manualSendReady.map((c) => c.id)))
                            }
                            className="text-xs font-medium text-mediterranean-700 border border-mediterranean-300 px-2.5 py-1 rounded-lg hover:bg-mediterranean-50"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const luca = findLucaTestContact(contacts);
                              setSelectedIds(luca ? new Set([luca.id]) : new Set());
                            }}
                            className="text-xs font-medium text-amber-800 border border-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-50"
                          >
                            Luca only
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="text-xs font-medium text-ink-600 border border-beige-600 px-2.5 py-1 rounded-lg hover:bg-cream-400"
                          >
                            Deselect all
                          </button>
                        </>
                      )}
                      {!hubManualMode && recipientSplit.ready.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIds(new Set(recipientSplit.ready.map((c) => c.id)))
                            }
                            className="text-xs font-medium text-mediterranean-700 border border-mediterranean-300 px-2.5 py-1 rounded-lg hover:bg-mediterranean-50"
                          >
                            Select all
                          </button>
                        </>
                      )}
                      {recipientSplit.alreadySent.length > 0 && (
                        <span className="text-xs text-ink-500 bg-ink-100 px-2 py-0.5 rounded-full">
                          {recipientSplit.alreadySent.length} already sent
                        </span>
                      )}
                    </div>
                    {hubManualMode && manualSendReady.length > 0 && selectedContacts.length === 0 && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                        Nobody selected — tick Luca to test, or Select all for everyone.
                      </p>
                    )}
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto mb-4">
                      {hubManualMode && manualSendReady.length === 0 ? (
                        <p className="text-sm text-ink-500 text-center py-6">
                          Luca test contact not found — add +393343782367 to contacts.
                        </p>
                      ) : !hubManualMode && recipientSplit.ready.length === 0 ? (
                        <p className="text-sm text-ink-500 text-center py-6">
                          Everyone in this audience already received this message.
                        </p>
                      ) : hubManualMode ? (
                        <div className="rounded-lg border border-beige-500 overflow-hidden divide-y divide-beige-400">
                          <div className="hidden sm:grid sm:grid-cols-[2rem_1fr_5.5rem_4.5rem] gap-2 px-3 py-2 bg-cream-400/80 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                            <span aria-hidden />
                            <span>Customer</span>
                            <span>Ordered</span>
                            <span className="text-right">Order</span>
                          </div>
                          {manualSendReady.map((contact) => {
                            const checked = selectedIds.has(contact.id);
                            const isLucaTest = isMessageDedupExemptPhone(contact.phone);
                            const { when, size, orderCount } = contactOrderSummary(contact);
                            const phoneWarning = getPhoneValidationWarning(contact.phone);
                            return (
                              <label
                                key={contact.id}
                                className={`flex flex-col sm:grid sm:grid-cols-[2rem_1fr_5.5rem_4.5rem] gap-1 sm:gap-2 sm:items-center px-3 py-2.5 cursor-pointer transition-colors ${
                                  isLucaTest
                                    ? checked
                                      ? 'bg-amber-50 ring-1 ring-inset ring-amber-300'
                                      : 'bg-amber-50/60 hover:bg-amber-50 ring-1 ring-inset ring-amber-200'
                                    : checked
                                      ? 'bg-mediterranean-50/70 hover:bg-mediterranean-50'
                                      : 'bg-white hover:bg-cream-400/40 opacity-90'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSendSelection(contact.id)}
                                  className="accent-mediterranean-700 shrink-0"
                                  aria-label={`Include ${contact.name}`}
                                />
                                <div className="min-w-0">
                                  <p className="font-medium text-ink-900 text-sm flex items-center gap-1.5 flex-wrap leading-snug">
                                    {contact.name}
                                    {isLucaTest ? (
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded">
                                        test first
                                      </span>
                                    ) : (
                                      <MessagePrefChip pref={contact.message_pref} />
                                    )}
                                  </p>
                                  <p className="text-[11px] font-mono text-ink-400 truncate">{contact.phone}</p>
                                  {phoneWarning && !isLucaTest && (
                                    <p className="text-[10px] text-amber-800 mt-0.5">⚠ {phoneWarning}</p>
                                  )}
                                  {isLucaTest && (
                                    <p className="text-[10px] text-amber-800 mt-0.5">
                                      Repeat sends OK — test the full flow here first
                                    </p>
                                  )}
                                  <p className="text-[10px] text-ink-400 sm:hidden mt-0.5">
                                    {when} · {size}
                                    {orderCount > 1 ? ` · ${orderCount} orders` : ''}
                                  </p>
                                </div>
                                <span className="hidden sm:block text-xs text-ink-600 whitespace-nowrap">
                                  {isLucaTest ? '—' : when}
                                </span>
                                <span className="hidden sm:block text-xs font-semibold text-ink-800 text-right whitespace-nowrap">
                                  {isLucaTest ? '—' : size}
                                  {!isLucaTest && orderCount > 1 && (
                                    <span className="block text-[10px] font-normal text-ink-400">
                                      {orderCount} orders
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        recipientSplit.ready.map((contact) => {
                          const checked = selectedIds.has(contact.id);
                          return (
                          <div
                            key={contact.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              checked
                                ? 'border-mediterranean-200 bg-mediterranean-50/50'
                                : 'border-beige-500 bg-ink-50/40 opacity-80'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {hubManualMode && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSendSelection(contact.id)}
                                  className="mt-1 accent-mediterranean-700 shrink-0"
                                  aria-label={`Include ${contact.name}`}
                                />
                              )}
                              <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <p className="font-medium text-ink-900 text-sm flex items-center gap-1.5 flex-wrap">
                                  {contact.name}
                                  <MessagePrefChip pref={contact.message_pref} />
                                  {isMessageDedupExemptPhone(contact.phone) && (
                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                      test
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs font-mono text-ink-500">{contact.phone}</p>
                              {getPhoneValidationWarning(contact.phone) && (
                                <p className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1 mt-1">
                                  ⚠ {getPhoneValidationWarning(contact.phone)}
                                </p>
                              )}
                              </div>
                              {!hubManualMode && (
                              <button
                                type="button"
                                onClick={() => removeFromQueue(contact.id)}
                                className="p-1 text-ink-400 hover:text-ink-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              )}
                            </div>
                            <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans leading-relaxed max-h-28 overflow-y-auto">
                              {previewBody(contact)}
                            </pre>
                              </div>
                            </div>
                          </div>
                          );
                        })
                      )}
                    </div>

                    {recipientSplit.alreadySent.length > 0 && (
                      <div className="mb-4 rounded-lg border border-ink-200 bg-ink-50/80 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowAlreadySent((v) => !v)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-ink-500 uppercase tracking-wide hover:bg-ink-100/80"
                        >
                          Already sent — not selectable ({recipientSplit.alreadySent.length})
                          {showAlreadySent ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {showAlreadySent && (
                          <div className="max-h-36 overflow-y-auto border-t border-ink-200 divide-y divide-ink-100">
                            {recipientSplit.alreadySent.map(({ contact, reason, sentAt }) => (
                              <div key={contact.id} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm text-ink-600 truncate">{contact.name}</p>
                                  <p className="text-[10px] text-ink-400">
                                    {reason}
                                    {sentAt ? ` · ${formatSentWhen(sentAt)}` : ''}
                                  </p>
                                </div>
                                <span className="text-[10px] font-medium text-ink-500 bg-white border border-ink-200 px-2 py-0.5 rounded-full shrink-0">
                                  Sent
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => primaryAction(selectedContacts, true)}
                      disabled={sending || selectedContacts.length === 0}
                      className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <MessageCircle className="w-6 h-6" />
                      )}
                      {variant === 'compose'
                        ? `Add to queue (${selectedContacts.length})`
                        : hubManualMode
                          ? openwaEnabled
                            ? `Send selected via OpenWA (${selectedContacts.length})`
                            : `Send selected (${selectedContacts.length})`
                          : openwaEnabled
                            ? `Send via OpenWA (${selectedContacts.length})`
                            : `Send WhatsApp (${selectedContacts.length})`}
                    </button>
                  </>
                )}
              </div>
            </section>
            )}
          </div>
          </>
        )}

        {!embedded && (
        <p className="text-center text-ink-400 text-sm mt-8">
          <Link to="/" className="hover:text-mediterranean-700 underline">
            ← Back to website
          </Link>
        </p>
        )}
    </div>
  );

  if (embedded) {
    return (
      <>
        {inner}
        {wizard && (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-end">
            <div className="w-full bg-white rounded-t-2xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl max-h-[90vh] overflow-y-auto">
              <p className="text-sm text-mediterranean-700 font-medium">
                {wizard.index + 1} of {wizard.contacts.length}
              </p>
              <h3 className="font-display text-2xl text-ink-900 mt-1">
                {wizard.contacts[wizard.index].name}
              </h3>
              <pre className="mt-4 text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400 rounded-lg p-3 border border-beige-500 max-h-48 overflow-y-auto">
                {fillTemplate(bodyFor(wizard.contacts[wizard.index]), wizard.contacts[wizard.index].name)}
              </pre>
              {openwaEnabled ? (
                <button
                  type="button"
                  onClick={markSentAndNext}
                  disabled={sending}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-[#25D366] text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-60"
                >
                  {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                  Send &amp; {wizard.index + 1 >= wizard.contacts.length ? 'Done' : 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={markSentAndNext}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-mediterranean-700 text-mediterranean-700 font-semibold"
                >
                  Mark sent &amp; next
                </button>
              )}
              <button type="button" onClick={() => setWizard(null)} className="w-full mt-2 py-2 text-ink-400 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
              <h1 className="font-display text-3xl sm:text-4xl">WhatsApp Messages</h1>
              <p className="text-mediterranean-100 mt-2 text-sm">
                Pick a message → recipients fill automatically → review → send
              </p>
            </div>
            <WhatsAppStatusLed variant="header" />
          </div>
          <CustomerAdminNav />
        </div>
      </header>
      <main>{inner}</main>

      {selectedContacts.length > 0 && !wizard && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-beige-600 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={() => primaryAction(selectedContacts, true)}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3.5 rounded-xl font-semibold disabled:opacity-60"
          >
            <MessageCircle className="w-5 h-5" />
            Send to {selectedContacts.length}
          </button>
        </div>
      )}

      {wizard && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-2xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl max-h-[90vh] overflow-y-auto">
            <p className="text-sm text-mediterranean-700 font-medium">
              {wizard.index + 1} of {wizard.contacts.length}
            </p>
            <h3 className="font-display text-2xl text-ink-900 mt-1">
              {wizard.contacts[wizard.index].name}
            </h3>
            <pre className="mt-4 text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400 rounded-lg p-3 border border-beige-500 max-h-48 overflow-y-auto">
              {fillTemplate(bodyFor(wizard.contacts[wizard.index]), wizard.contacts[wizard.index].name)}
            </pre>
            {openwaEnabled ? (
              <button
                type="button"
                onClick={markSentAndNext}
                disabled={sending}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-[#25D366] text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                Send &amp; {wizard.index + 1 >= wizard.contacts.length ? 'Done' : 'Next'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      whatsappUrl(
                        wizard.contacts[wizard.index].phone,
                        fillTemplate(
                          bodyFor(wizard.contacts[wizard.index]),
                          wizard.contacts[wizard.index].name,
                        ),
                      ),
                      '_blank',
                    )
                  }
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-[#25D366] text-white py-4 rounded-xl text-lg font-semibold"
                >
                  <MessageCircle className="w-6 h-6" />
                  Open WhatsApp
                </button>
                <button
                  type="button"
                  onClick={markSentAndNext}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl border border-mediterranean-700 text-mediterranean-700 font-semibold"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Mark sent &amp; {wizard.index + 1 >= wizard.contacts.length ? 'Done' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            <button type="button" onClick={() => setWizard(null)} className="w-full mt-2 py-2 text-ink-400 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
