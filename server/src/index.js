import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractContactsFromImage } from './ocr.js';
import { FIRST_VISIT_MESSAGES } from '../../shared/firstVisitCampaign.js';
import { computeCampaignAnalytics } from '../../shared/campaignAnalytics.js';
import { computeOrderAnalytics } from '../../shared/orderAnalytics.js';
import { computeOrderKpis } from '../../shared/orderKpis.js';
import { computeOrderProjection } from '../../shared/orderProjection.js';
import { computeCustomerSegments } from '../../shared/customerSegments.js';
import { extractOrderTimestamp } from '../../shared/orderTimestamp.js';
import { detectGrabScreenshotType, extractOrderValue } from '../../shared/parseOrderValue.js';
import { extractImageCaptureMs, parseClientCaptureIso } from './extractImageTimestamp.js';
import {
  listContacts,
  listContactsWithMessages,
  saveContacts,
  deleteContact,
  logMessageSent,
  getMessageLogs,
  checkPhones,
  getSetting,
  setSetting,
  isFollowupCampaignEnabled,
  listCampaignQueue,
  syncCampaignEnrollments,
  getCampaignEnrollmentSummary,
  advanceCampaignSend,
  recordCampaignReply,
  getEnrollment,
  resetCampaignEnrollment,
  findContactByPhone,
  listCampaignResults,
  getWhatsAppInteractions,
  listAllOrders,
  getContactOrders,
  saveOrderScreenshot,
  listOrderScreenshots,
  reprocessOrderScreenshots,
  resolveScreenshotPath,
  reconcileOrderValuesFromArchive,
  listMessageTemplates,
  saveMessageTemplate,
  listMessageQueue,
  queueCustomMessages,
  clearMessageQueue,
  getContactById,
  listEndOfDayAudience,
  listOnboardingQueue,
  listPendingOnboardingManual,
  listWholesaleLeads,
  saveWholesaleLead,
  updateWholesaleLeadStatus,
  listWholesaleQueue,
  clearWholesaleQueue,
  listWholesaleInbox,
  listWaOrders,
  getWaOrder,
  getWaOrderEvents,
  getWaOrderMetrics,
  listWaOrderMessages,
  listWaProducts,
  updateWaOrder,
  listWaDrivers,
  createWaDriver,
  updateWaDriver,
  deleteWaDriver,
  getWaDriver,
} from './db.js';
import { queueWholesaleMessages, checkWholesaleSend } from './wholesaleQueue.js';
import { sendWholesaleBatch } from './wholesaleOutreach.js';
import { handleWholesaleInbound } from './wholesaleInbox.js';
import { handleWaOrderInbound, sendWaOrderReply, advanceWaOrderStatus } from './waOrderBot.js';
import { notifyWaOrderChange, waOrderBus } from './waOrderBus.js';
import { dispatchWaOrderToDrivers, handleDriverDispatchInbound, getWaOrderDriverInfo } from './waOrderDrivers.js';
import { handleHitPayWebhook, markWaOrderPaidManual, verifyHitPayWebhookSignature } from './waOrderPayment.js';
import { sendWaOrderTestAdToLuca } from './waOrderTestAd.js';
import {
  getCustomerTrackingView,
  getDriverTrackingView,
  recordDriverGps,
  getWaTrackingSettings,
  patchWaTrackingSettings,
} from './waOrderTracking.js';
import {
  getOpenwaStatus,
  openwaConfig,
  registerWebhook,
  ensureOpenwaSession,
  startOpenwaWatchdog,
} from './openwa.js';
import { handleIncomingMessage, sendCampaignStep, sendCampaignBatch } from './whatsappCampaign.js';
import { sendAdHocMessage, sendAdHocBatch } from './adHocMessages.js';
import {
  sendPreferencePollBatch,
  handlePreferenceReply,
} from './messagePreferences.js';
import {
  processDueOnboarding,
  sendOnboardingToContact,
} from './onboardingScheduler.js';
import { generateEngagementStrategy } from './engagementAgent.js';
import { generateCampaignDrafts, stageCampaignDrafts } from './campaignDraftAgent.js';
import { readBusinessMemory, appendBusinessInsight, parseLatestDailyBrief } from './businessMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const PORT = process.env.PORT || 3001;

const recentWebhookKeys = new Map();
const WEBHOOK_DEDUPE_MS = 90_000;

function isDuplicateWebhook(key) {
  if (!key) return false;
  const now = Date.now();
  const seen = recentWebhookKeys.get(key);
  if (seen != null && now - seen < WEBHOOK_DEDUPE_MS) return true;
  recentWebhookKeys.set(key, now);
  for (const [k, t] of recentWebhookKeys) {
    if (now - t >= WEBHOOK_DEDUPE_MS) recentWebhookKeys.delete(k);
  }
  return false;
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dolcesicilia-contacts' });
});

app.get('/api/settings', (_req, res) => {
  res.json({
    followupCampaignEnabled: isFollowupCampaignEnabled(),
    autoSendEnabled: getSetting('auto_send_enabled', 'false') === 'true',
    manualOnlyMessaging: true,
    senderName: getSetting('sender_name', 'Luca'),
    openwaEnabled: getSetting('openwa_enabled', 'false') === 'true',
    openwaUrl: getSetting('openwa_url', 'http://127.0.0.1:2785'),
    openwaApiKey: getSetting('openwa_api_key', ''),
    openwaSessionId: getSetting('openwa_session_id', ''),
  });
});

app.patch('/api/settings', (req, res) => {
  let syncResult = null;
  if (req.body.followupCampaignEnabled !== undefined) {
    setSetting('followup_campaign_enabled', req.body.followupCampaignEnabled ? 'true' : 'false');
    if (req.body.followupCampaignEnabled) {
      syncResult = syncCampaignEnrollments();
    }
  }
  if (req.body.autoSendEnabled !== undefined) {
    setSetting('auto_send_enabled', req.body.autoSendEnabled ? 'true' : 'false');
  }
  if (req.body.senderName) {
    setSetting('sender_name', req.body.senderName);
  }
  if (req.body.openwaEnabled !== undefined) {
    setSetting('openwa_enabled', req.body.openwaEnabled ? 'true' : 'false');
  }
  if (req.body.openwaUrl !== undefined) {
    setSetting('openwa_url', req.body.openwaUrl || 'http://127.0.0.1:2785');
  }
  if (req.body.openwaApiKey !== undefined) {
    setSetting('openwa_api_key', req.body.openwaApiKey);
  }
  if (req.body.openwaSessionId !== undefined) {
    setSetting('openwa_session_id', req.body.openwaSessionId);
  }
  res.json({
    followupCampaignEnabled: isFollowupCampaignEnabled(),
    autoSendEnabled: getSetting('auto_send_enabled', 'false') === 'true',
    manualOnlyMessaging: getSetting('auto_send_enabled', 'false') !== 'true',
    senderName: getSetting('sender_name', 'Luca'),
    openwaEnabled: getSetting('openwa_enabled', 'false') === 'true',
    openwaUrl: getSetting('openwa_url', 'http://127.0.0.1:2785'),
    openwaApiKey: getSetting('openwa_api_key', ''),
    openwaSessionId: getSetting('openwa_session_id', ''),
    newlyEnrolled: syncResult?.enrolled || [],
    enrollmentSummary: getCampaignEnrollmentSummary(),
  });
});

app.get('/api/whatsapp/status', async (_req, res) => {
  const status = await getOpenwaStatus();
  res.json(status);
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const { event, data } = req.body || {};
    if (event !== 'message.received' || !data) {
      return res.json({ ok: true, skipped: true });
    }
    if (data.fromMe) return res.json({ ok: true, skipped: 'from_me' });

    const from = data.from || data.chatId;
    const body = data.body || data.text || data.selectedOption || '';
    const messageType = data.type || 'chat';
    const voteBody = data.selectedOption || body;
    const webhookKey =
      data.id ||
      data.messageId ||
      `${from}|${voteBody}|${messageType}`;

    if (isDuplicateWebhook(webhookKey)) {
      return res.json({ ok: true, skipped: 'duplicate_webhook' });
    }

    if (messageType === 'order') {
      console.log('[wa-order] catalog webhook keys:', Object.keys(data).join(', '));
      console.log('[wa-order] catalog payload:', JSON.stringify(data).slice(0, 2500));
    }

    console.log('WhatsApp webhook:', messageType, from, body?.slice?.(0, 80) || (data.order ? '[catalog order]' : ''));

    const wholesaleResult = await handleWholesaleInbound(from, body, messageType);
    if (wholesaleResult.handled) {
      return res.json(wholesaleResult);
    }

    const driverResult = await handleDriverDispatchInbound(from, body, messageType);
    if (driverResult.handled) {
      return res.json(driverResult);
    }

    const waOrderResult = await handleWaOrderInbound(from, body, messageType, data);
    if (waOrderResult.handled) {
      notifyWaOrderChange(waOrderResult.orderId, 'webhook');
      return res.json(waOrderResult);
    }

    const campaignResult = await handleIncomingMessage(from, body, messageType);
    if (campaignResult.ok) {
      return res.json(campaignResult);
    }

    const prefResult = await handlePreferenceReply(from, body, messageType, {
      selectedRowId: data.selectedRowId || data.listRowId || data.rowId,
      selectedOption: data.selectedOption,
    });
    if (prefResult.handled) {
      return res.json(prefResult);
    }

    res.json(campaignResult);
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/setup-webhook', async (req, res) => {
  try {
    const port = process.env.PORT || 3001;
    const webhookUrl =
      req.body.webhookUrl ||
      `http://host.docker.internal:${port}/api/whatsapp/webhook`;
    const result = await registerWebhook(webhookUrl);
    setSetting('openwa_webhook_url', webhookUrl);
    res.json({ ok: true, webhookUrl, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ocr', upload.array('images', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    let imageCaptureTimes = [];
    try {
      imageCaptureTimes = JSON.parse(req.body.imageCaptureTimes || '[]');
    } catch {
      imageCaptureTimes = [];
    }

    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { text, contacts } = await extractContactsFromImage(file.buffer);
      const captureMs =
        (await extractImageCaptureMs(file.buffer)) ??
        parseClientCaptureIso(imageCaptureTimes[i]);
      const orderTs = extractOrderTimestamp(text, captureMs);
      const orderVal = extractOrderValue(text);
      const stored = saveOrderScreenshot({
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        ocrText: text,
        imageCaptureMs: captureMs,
        contactsJson: contacts,
      });
      const enriched = contacts.map((c) => {
        const check = c.phone
          ? checkPhones([c.phone])[0]
          : { exists: false, customer_type: null, name: null, order_count: 0 };
        const isReturning = check.exists;
        return {
          ...c,
          sourceImage: file.originalname,
          screenshotId: stored.id,
          existing: isReturning,
          customer_type: isReturning ? 'returning' : 'first_time',
          existingName: check.name,
          order_count: isReturning ? (check.order_count || 0) + 1 : 1,
          orderedAt: orderTs?.orderedAt,
          orderTimeLabel: orderTs?.label,
          timestampSource: orderTs?.source,
          screenshotAt: captureMs ? new Date(captureMs).toISOString() : null,
          orderValue: orderVal?.orderValue ?? null,
          orderValueLabel: orderVal?.raw ?? null,
          valueSource: orderVal?.source ?? null,
          currency: orderVal?.currency ?? 'SGD',
          isNewCustomerGrab: orderVal?.isNewCustomer ?? false,
        };
      });
      results.push({
        filename: file.originalname,
        text,
        contacts: enriched,
        orderTimestamp: orderTs,
        orderValue: orderVal,
        screenshotId: stored.id,
      });
    }

    res.json({ results, contacts: results.flatMap((r) => r.contacts) });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR processing failed' });
  }
});

app.get('/api/contacts', (req, res) => {
  if (req.query.withMessages === '1' || req.query.enriched === '1') {
    return res.json({ contacts: listContactsWithMessages() });
  }
  res.json({ contacts: listContacts() });
});

app.post('/api/contacts/check', (req, res) => {
  const { phones } = req.body;
  if (!Array.isArray(phones)) return res.status(400).json({ error: 'phones array required' });
  res.json({ results: checkPhones(phones) });
});

app.get('/api/templates', (_req, res) => {
  res.json({ templates: listMessageTemplates() });
});

app.post('/api/templates', (req, res) => {
  try {
    const { name, description, body, targetSegment } = req.body || {};
    const template = saveMessageTemplate({ name, description, body, targetSegment });
    res.json({ template, templates: listMessageTemplates() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/campaign/messages', (_req, res) => {
  res.json({ messages: FIRST_VISIT_MESSAGES });
});

app.get('/api/campaign/results', (_req, res) => {
  const results = listCampaignResults();
  res.json({ results, analytics: computeCampaignAnalytics(results) });
});

app.get('/api/orders/projection', (_req, res) => {
  const orders = listAllOrders();
  res.json(computeOrderProjection(orders));
});

app.get('/api/orders/kpis', (_req, res) => {
  const orders = listAllOrders();
  res.json(computeOrderKpis(orders));
});

app.get('/api/orders/analytics', (_req, res) => {
  const orders = listAllOrders();
  const contacts = listContacts();
  res.json(computeOrderAnalytics(orders, contacts));
});

app.get('/api/ai/business-memory', (_req, res) => {
  res.json(readBusinessMemory());
});

app.get('/api/daily-brief/latest', (_req, res) => {
  try {
    const brief = parseLatestDailyBrief();
    res.json({ brief });
  } catch (err) {
    console.error('daily-brief/latest:', err);
    res.json({ brief: null });
  }
});

app.post('/api/ai/business-memory', (req, res) => {
  try {
    const { insight, category } = req.body || {};
    const result = appendBusinessInsight({
      text: insight,
      source: 'orders-page',
      category: category || 'insight',
    });
    res.json({ ...readBusinessMemory(), saved: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ai/engagement-strategy', async (_req, res) => {
  try {
    const result = await generateEngagementStrategy({
      orders: listAllOrders(),
      contacts: listContactsWithMessages(),
      campaignResults: listCampaignResults(),
    });
    setSetting('last_engagement_strategy', JSON.stringify({
      generatedAt: result.generatedAt,
      model: result.model,
      strategy: result.strategy,
      parseWarning: result.parseWarning || null,
    }));
    res.json(result);
  } catch (err) {
    console.error('Engagement strategy error:', err);
    res.status(err.message?.includes('ANTHROPIC_API_KEY') ? 503 : 500).json({
      error: err.message || 'Strategy generation failed',
    });
  }
});

app.get('/api/ai/engagement-strategy/latest', (_req, res) => {
  const raw = getSetting('last_engagement_strategy', '');
  if (!raw) return res.json({ strategy: null });
  try {
    res.json(JSON.parse(raw));
  } catch {
    res.json({ strategy: null });
  }
});

app.post('/api/ai/draft-messages', async (req, res) => {
  try {
    const { segmentId, autoQueue = false } = req.body || {};
    const dataSources = {
      orders: listAllOrders(),
      contacts: listContactsWithMessages(),
      campaignResults: listCampaignResults(),
    };
    const result = await generateCampaignDrafts(dataSources, { segmentId, autoQueue });
    if (autoQueue) {
      setSetting(
        'last_campaign_drafts',
        JSON.stringify({
          generatedAt: result.generatedAt,
          model: result.model,
          summary: result.summary,
          drafts: result.drafts,
          queuedCount: result.queuedCount,
        }),
      );
    }
    res.json({
      ...result,
      queue: listMessageQueue(),
    });
  } catch (err) {
    console.error('Campaign draft error:', err);
    res.status(err.message?.includes('ANTHROPIC_API_KEY') ? 503 : 500).json({
      error: err.message || 'Draft generation failed',
    });
  }
});

app.post('/api/ai/draft-messages/stage', (req, res) => {
  try {
    const { items, queueItems } = req.body || {};
    const rows = items || queueItems;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'items or queueItems array required' });
    }
    const result = stageCampaignDrafts(rows);
    res.json({
      ok: true,
      ...result,
      count: result.queued.length,
      queue: listMessageQueue(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ai/draft-messages/latest', (_req, res) => {
  const raw = getSetting('last_campaign_drafts', '');
  if (!raw) return res.json({ drafts: null });
  try {
    res.json(JSON.parse(raw));
  } catch {
    res.json({ drafts: null });
  }
});

app.get('/api/screenshots', (_req, res) => {
  res.json({ screenshots: listOrderScreenshots() });
});

app.get('/api/screenshots/:id/file', (req, res) => {
  const filePath = resolveScreenshotPath(req.params.id);
  if (!filePath) return res.status(404).json({ error: 'Screenshot not found' });
  res.sendFile(filePath);
});

app.post('/api/screenshots/reprocess', async (_req, res) => {
  try {
    const result = await reprocessOrderScreenshots();
    res.json({
      ...result,
      orders: listAllOrders(),
      screenshots: listOrderScreenshots(),
    });
  } catch (err) {
    console.error('Reprocess error:', err);
    res.status(500).json({ error: err.message || 'Reprocess failed' });
  }
});

/** Store screenshots + OCR only — never touches contacts or orders. */
app.post('/api/screenshots/archive', upload.array('images', 50), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    let imageCaptureTimes = [];
    try {
      imageCaptureTimes = JSON.parse(req.body.imageCaptureTimes || '[]');
    } catch {
      imageCaptureTimes = [];
    }

    const stored = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { text, contacts } = await extractContactsFromImage(file.buffer);
      const captureMs =
        (await extractImageCaptureMs(file.buffer)) ??
        parseClientCaptureIso(imageCaptureTimes[i]);
      const row = saveOrderScreenshot({
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        ocrText: text,
        imageCaptureMs: captureMs,
        contactsJson: contacts,
      });
      const screenType = detectGrabScreenshotType(text);
      stored.push({
        id: row.id,
        filename: file.originalname,
        orderValue: row.orderValue?.orderValue ?? null,
        contactsFound: contacts.length,
        screenType,
        rejectReason:
          row.orderValue?.orderValue == null
            ? 'No order value found in OCR.'
            : null,
      });
    }

    res.json({
      stored: stored.length,
      screenshots: stored,
      total: listOrderScreenshots().length,
    });
  } catch (err) {
    console.error('Archive upload error:', err);
    res.status(500).json({ error: err.message || 'Archive upload failed' });
  }
});

/** Match archived screenshots to existing orders — only fills order_value. */
app.post('/api/orders/reconcile-values', async (_req, res) => {
  try {
    const result = await reconcileOrderValuesFromArchive();
    res.json({
      ...result,
      screenshots: listOrderScreenshots().length,
    });
  } catch (err) {
    console.error('Reconcile error:', err);
    res.status(500).json({ error: err.message || 'Reconcile failed' });
  }
});

app.get('/api/segments', (_req, res) => {
  const contacts = listContactsWithMessages();
  res.json({
    segments: computeCustomerSegments(contacts),
    pendingOnboarding: listPendingOnboardingManual(),
  });
});

app.get('/api/contacts/:id/orders', (req, res) => {
  res.json({ orders: getContactOrders(req.params.id) });
});

app.get('/api/campaign/analytics', (_req, res) => {
  const results = listCampaignResults();
  res.json(computeCampaignAnalytics(results));
});

app.get('/api/campaign/interactions/:contactId', (req, res) => {
  res.json({ interactions: getWhatsAppInteractions(req.params.contactId) });
});

app.get('/api/campaign/queue', (_req, res) => {
  const sync = syncCampaignEnrollments();
  const summary = getCampaignEnrollmentSummary();
  res.json({
    queue: listOnboardingQueue(),
    onboardingQueue: listOnboardingQueue(),
    legacyCampaignQueue: listCampaignQueue(),
    followupEnabled: isFollowupCampaignEnabled(),
    onboardingEnabled: isFollowupCampaignEnabled(),
    senderName: getSetting('sender_name', 'Luca'),
    summary,
    pendingEnrollment: summary.pendingEnrollment,
    newlyEnrolled: sync.enrolled,
    newlyScheduled: sync.scheduled || sync.enrolled,
  });
});

app.get('/api/onboarding/queue', (_req, res) => {
  const sync = syncCampaignEnrollments();
  res.json({
    queue: listOnboardingQueue(),
    summary: getCampaignEnrollmentSummary(),
    onboardingEnabled: isFollowupCampaignEnabled(),
    senderName: getSetting('sender_name', 'Luca'),
    newlyScheduled: sync.scheduled || sync.enrolled,
  });
});

app.get('/api/onboarding/pending-manual', (_req, res) => {
  res.json({ contacts: listPendingOnboardingManual() });
});

app.post('/api/onboarding/send', async (req, res) => {
  const { contactId } = req.body || {};
  if (!contactId) return res.status(400).json({ error: 'contactId required' });
  try {
    const result = await sendOnboardingToContact(contactId);
    if (!result.ok) return res.status(400).json({ error: result.error, ...result });
    res.json({ ok: true, ...result, queue: listOnboardingQueue() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/onboarding/process-due', async (req, res) => {
  try {
    const result = await processDueOnboarding({ manual: true });
    res.json({ ...result, queue: listOnboardingQueue() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/end-of-day-audience', (req, res) => {
  const minDays = Number(req.query.minDaysBetween) || 7;
  const audience = listEndOfDayAudience(minDays);
  res.json({
    count: audience.length,
    contacts: audience.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      messagePref: c.message_pref,
      endOfDayOptin: !!c.end_of_day_optin,
    })),
  });
});

app.post('/api/messages/queue-end-of-day', (req, res) => {
  try {
    const { body, messageBody, minDaysBetween = 7, contactIds } = req.body || {};
    const text = (messageBody || body || '').trim();
    if (!text) return res.status(400).json({ error: 'messageBody required' });

    let audience = listEndOfDayAudience(minDaysBetween);
    if (Array.isArray(contactIds) && contactIds.length > 0) {
      const idSet = new Set(contactIds);
      audience = audience.filter((c) => idSet.has(c.id));
    }
    if (audience.length === 0) {
      return res.status(400).json({ error: 'No eligible end-of-day contacts' });
    }

    const result = queueCustomMessages({
      items: audience.map((c) => ({
        contactId: c.id,
        body: text,
        templateId: 'end-of-day-tray',
        templateName: 'End-of-day tray',
      })),
      minDaysBetween,
    });
    res.json({ ...result, audienceCount: audience.length, queue: listMessageQueue() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/campaign/sync-enrollments', (_req, res) => {
  const sync = syncCampaignEnrollments();
  const summary = getCampaignEnrollmentSummary();
  res.json({
    ok: true,
    enrolled: sync.enrolled,
    queue: listCampaignQueue(),
    summary,
    pendingEnrollment: summary.pendingEnrollment,
  });
});

app.post('/api/campaign/send-batch', async (req, res) => {
  const { contactIds } = req.body;
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return res.status(400).json({ error: 'contactIds array required' });
  }

  const cfg = openwaConfig();
  if (!cfg.enabled) {
    return res.status(400).json({ error: 'OpenWA must be enabled for bulk send' });
  }

  try {
    const senderName = getSetting('sender_name', 'Luca');
    const result = await sendCampaignBatch(contactIds, senderName);
    res.json(result);
  } catch (err) {
    console.error('Bulk send error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaign/send', async (req, res) => {
  const { contactId, step, messageBody, viaOpenwa } = req.body;
  if (!contactId) {
    return res.status(400).json({ error: 'contactId required' });
  }

  const cfg = openwaConfig();
  const useOpenwa = viaOpenwa !== false && cfg.enabled;

  try {
    if (useOpenwa) {
      const senderName = getSetting('sender_name', 'Luca');
      const result = await sendCampaignStep(contactId, senderName);
      if (!result.ok) return res.status(400).json({ error: result.error, needsQrScan: true });
      return res.json({
        ok: true,
        enrollment: result.enrollment,
        sentViaOpenwa: true,
        queue: listCampaignQueue(),
      });
    }

    if (!step || !messageBody) {
      return res.status(400).json({ error: 'step and messageBody required' });
    }
    const enrollment = advanceCampaignSend(contactId, step, messageBody);
    res.json({ ok: true, enrollment, queue: listCampaignQueue() });
  } catch (err) {
    console.error('Campaign send error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaign/reply', (req, res) => {
  const { contactId, replyKey, replyValue } = req.body;
  if (!contactId || !replyKey) {
    return res.status(400).json({ error: 'contactId and replyKey required' });
  }
  const enrollment = recordCampaignReply(contactId, replyKey, replyValue, {
    label: req.body.replyLabel,
    raw: req.body.replyRaw,
  });
  res.json({ ok: true, enrollment, queue: listCampaignQueue() });
});

app.post('/api/campaign/reset', (req, res) => {
  const { contactId, phone } = req.body;
  let id = contactId;
  if (!id && phone) {
    const contact = findContactByPhone(phone);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    id = contact.id;
  }
  if (!id) return res.status(400).json({ error: 'contactId or phone required' });
  const enrollment = resetCampaignEnrollment(id);
  res.json({ ok: true, enrollment, queue: listCampaignQueue() });
});

app.get('/api/campaign/:contactId', (req, res) => {
  res.json({ enrollment: getEnrollment(req.params.contactId) });
});

app.get('/api/messages/queue', (_req, res) => {
  res.json({ queue: listMessageQueue() });
});

app.post('/api/messages/queue', (req, res) => {
  try {
    const { contactIds, body, items, minDaysBetween, campaignType, replacePending } = req.body || {};
    const result = queueCustomMessages({
      contactIds,
      body,
      items,
      minDaysBetween,
      campaignType,
      respectPending: !replacePending,
      replacePending: !!replacePending,
      respectMcpPending: true,
    });
    res.json({
      ...result,
      count: result.queued.length,
      queue: listMessageQueue(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/messages/queue', (req, res) => {
  try {
    const contactIds = req.body?.contactIds;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        error:
          'contactIds required. Bulk queue clear is disabled — pending messages stay until each one is sent.',
      });
    }
    const cleared = clearMessageQueue(contactIds);
    res.json({ ok: true, cleared, queue: listMessageQueue() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/messages/send', async (req, res) => {
  const { contactId, messageBody, templateId, templateName, customerName, campaignType } = req.body;
  if (!contactId || !messageBody) {
    return res.status(400).json({ error: 'contactId and messageBody required' });
  }
  try {
    const result = await sendAdHocMessage({
      contactId,
      messageBody,
      templateId,
      templateName,
      customerName,
      campaignType,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ...result, contacts: listContactsWithMessages() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/send-batch', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }
  const cfg = openwaConfig();
  if (!cfg.enabled) {
    return res.status(400).json({ error: 'OpenWA must be enabled for bulk template send' });
  }
  try {
    const result = await sendAdHocBatch(items);
    res.json({ ...result, contacts: listContactsWithMessages() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/preference-poll/queue', async (req, res) => {
  try {
    const { contactIds, segmentId, onlyUnset = true } = req.body || {};
    let ids = Array.isArray(contactIds) ? [...contactIds] : [];

    if (segmentId) {
      const segments = computeCustomerSegments(listContactsWithMessages());
      const seg = segments.find((s) => s.id === segmentId);
      ids = seg?.contacts.map((c) => c.id) ?? [];
    }

    if (onlyUnset) {
      ids = ids.filter((id) => {
        const c = getContactById(id);
        return c && (!c.message_pref || c.message_pref === 'unset');
      });
    }

    if (ids.length === 0) {
      return res.status(400).json({ error: 'No eligible contacts (need unset preference)' });
    }

    const result = await sendPreferencePollBatch(ids);
    res.json({ ...result, contacts: listContactsWithMessages() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/log', (req, res) => {
  const { contactId, templateId, templateName, messageBody } = req.body;
  if (!contactId || !messageBody) {
    return res.status(400).json({ error: 'contactId and messageBody required' });
  }
  const log = logMessageSent({ contactId, templateId, templateName, messageBody });
  res.json({ ok: true, log, contacts: listContactsWithMessages() });
});

app.get('/api/contacts/:id/messages', (req, res) => {
  res.json({ messages: getMessageLogs(req.params.id) });
});

app.post('/api/contacts', (req, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'contacts array required' });
  }
  const result = saveContacts(contacts);
  res.json({
    ...result,
    saved: result.new.length,
    contacts: listContactsWithMessages(),
  });
});

app.delete('/api/contacts/:id', (req, res) => {
  deleteContact(req.params.id);
  res.json({ contacts: listContacts() });
});

app.get('/api/wholesale/leads', (req, res) => {
  const { zone, status } = req.query;
  res.json({ leads: listWholesaleLeads({ zone, status }) });
});

app.post('/api/wholesale/leads', (req, res) => {
  try {
    const lead = saveWholesaleLead(req.body || {});
    res.json({ ok: true, lead, leads: listWholesaleLeads() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/wholesale/leads/:id/status', (req, res) => {
  try {
    const { status } = req.body || {};
    const lead = updateWholesaleLeadStatus(req.params.id, status);
    res.json({ ok: true, lead, leads: listWholesaleLeads() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/wholesale/queue', (_req, res) => {
  res.json({ queue: listWholesaleQueue() });
});

app.get('/api/wholesale/inbox', (req, res) => {
  const { since, unreadOnly } = req.query;
  res.json({
    messages: listWholesaleInbox({
      since: since || undefined,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    }),
  });
});

app.post('/api/wholesale/queue', (req, res) => {
  try {
    const { items, minDaysBetween, replacePending } = req.body || {};
    const result = queueWholesaleMessages({ items, minDaysBetween, replacePending });
    res.json({
      ...result,
      count: result.queued.length,
      queue: listWholesaleQueue(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/wholesale/queue', (req, res) => {
  try {
    const leadIds = req.body?.leadIds;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'leadIds required. Bulk queue clear is disabled — pending messages stay until sent.',
      });
    }
    const cleared = clearWholesaleQueue(leadIds);
    res.json({ ok: true, cleared, queue: listWholesaleQueue() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wholesale/send-batch', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }
  const cfg = openwaConfig();
  if (!cfg.enabled) {
    return res.status(400).json({ error: 'OpenWA must be enabled for wholesale send' });
  }
  try {
    const result = await sendWholesaleBatch(items);
    res.json({ ...result, leads: listWholesaleLeads(), queue: listWholesaleQueue() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wholesale/check-send', (req, res) => {
  try {
    const { leadId, body, minDaysBetween } = req.body || {};
    if (!leadId || !body) return res.status(400).json({ error: 'leadId and body required' });
    res.json(checkWholesaleSend(leadId, body, minDaysBetween));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── WhatsApp Orders ─────────────────────────────────────────────────────────

app.get('/api/wa-orders/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const onChange = () => {
    res.write(`data: ${JSON.stringify({ at: Date.now() })}\n\n`);
  };
  waOrderBus.on('change', onChange);
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(keepalive);
    waOrderBus.off('change', onChange);
  });
});

app.post('/api/wa-orders/send-test-ad', async (_req, res) => {
  try {
    const result = await sendWaOrderTestAdToLuca();
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wa-orders/settings', (_req, res) => {
  res.json(getWaTrackingSettings());
});

app.patch('/api/wa-orders/settings', (req, res) => {
  try {
    res.json(patchWaTrackingSettings(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/track/:orderNumber', (req, res) => {
  const token = req.query.token;
  const view = getCustomerTrackingView(req.params.orderNumber, token);
  if (!view) return res.status(404).json({ error: 'Tracking not found' });
  res.json(view);
});

app.get('/api/track/driver/:token', (req, res) => {
  const view = getDriverTrackingView(req.params.token);
  if (!view) return res.status(404).json({ error: 'Tracking not found' });
  res.json(view);
});

app.post('/api/track/driver/:token/location', (req, res) => {
  const { lat, lng } = req.body || {};
  const result = recordDriverGps(req.params.token, lat, lng);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/wa-orders', (req, res) => {
  const status = req.query.status || 'all';
  res.json({
    orders: listWaOrders({ status: status === 'all' ? undefined : status }),
    metrics: getWaOrderMetrics(),
    products: listWaProducts(),
  });
});

app.get('/api/wa-orders/:id', (req, res) => {
  const order = getWaOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({
    order,
    events: getWaOrderEvents(order.id),
    messages: listWaOrderMessages(order.customer_phone),
    driver: getWaOrderDriverInfo(order.id),
  });
});

app.patch('/api/wa-orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const result = await advanceWaOrderStatus(req.params.id, status);
    notifyWaOrderChange(req.params.id, 'status');
    if (result.whatsapp?.sent === false && result.whatsapp?.error) {
      return res.status(502).json({
        error: `Status updated but WhatsApp failed: ${result.whatsapp.error}`,
        order: result.order,
        whatsapp: result.whatsapp,
      });
    }
    res.json({ ok: true, order: result.order, whatsapp: result.whatsapp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wa-orders/:id/mark-paid', async (req, res) => {
  try {
    const order = await markWaOrderPaidManual(req.params.id);
    notifyWaOrderChange(req.params.id, 'paid');
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wa-orders/:id/reply', async (req, res) => {
  try {
    const { message } = req.body || {};
    const result = await sendWaOrderReply(req.params.id, message);
    if (!result.ok) return res.status(400).json({ error: result.error || 'Send failed' });
    notifyWaOrderChange(req.params.id, 'reply');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wa-orders/:id/find-driver', async (req, res) => {
  try {
    const result = await dispatchWaOrderToDrivers(req.params.id);
    notifyWaOrderChange(req.params.id, 'driver');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/wa-drivers', (_req, res) => {
  res.json({ drivers: listWaDrivers() });
});

app.post('/api/wa-drivers', (req, res) => {
  try {
    const { name, phone, notes } = req.body || {};
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'name and phone required' });
    }
    const driver = createWaDriver({ name, phone, notes });
    res.json({ ok: true, driver });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/wa-drivers/:id', (req, res) => {
  try {
    const driver = updateWaDriver(req.params.id, req.body || {});
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json({ ok: true, driver });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/wa-drivers/:id', (req, res) => {
  try {
    deleteWaDriver(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wa-orders/hitpay-webhook', async (req, res) => {
  try {
    const sig = req.headers['x-hitpay-signature'] || req.headers['hitpay-signature'];
    const raw = JSON.stringify(req.body || {});
    if (sig && !verifyHitPayWebhookSignature(raw, sig)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const result = await handleHitPayWebhook(req.body || {});
    if (result.orderId) notifyWaOrderChange(result.orderId, 'hitpay');
    res.json(result);
  } catch (err) {
    console.error('HitPay webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (keeping server alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (keeping server alive):', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dolce Sicilia API running on http://0.0.0.0:${PORT}`);
  console.log('[messaging] Manual-only mode — no automatic outbound WhatsApp (scheduler off)');
  startOpenwaWatchdog(30_000);
  ensureOpenwaSession()
    .then((result) => {
      if (result.ok) {
        console.log('[OpenWA] Session connected on startup');
      } else if (!result.skipped) {
        console.warn('[OpenWA] Startup connect:', result.error || result.status);
      }
    })
    .catch((err) => console.warn('[OpenWA] Startup connect error:', err.message));
});
