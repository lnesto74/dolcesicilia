import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  FIRST_VISIT_CAMPAIGN_ID,
  answerLabelFor,
  formatStoredAnswer,
} from '../../shared/firstVisitCampaign.js';
import {
  ONBOARDING_INTRO_BODY,
  ONBOARDING_TEMPLATE_ID,
  onboardingDeliverAfterIso,
} from '../../shared/onboardingFlow.js';
import { PREFERENCE_POLL_TEMPLATE_ID } from '../../shared/messagePreferences.js';
import { deflateInflatedWaOrderPrices } from '../../shared/waOrderCatalog.js';
import { todayKeySg, addDayKey } from '../../shared/orderKpiUtils.js';
import {
  storeScreenshot,
  linkScreenshotToOrder,
  listScreenshots,
  reprocessAllScreenshots,
  getScreenshotFilePath,
} from './screenshots.js';
import { reconcileOrderValues } from './reconcileOrderValues.js';
import { MESSAGE_TEMPLATES, fillTemplate } from '../../shared/messageTemplates.js';
import { isEligibleForLaunchCampaign } from './messagePrefFilter.js';
import { contactAlreadyReceivedMessage, duplicateSkipReason } from './messageDedup.js';
import { isMessageDedupExemptPhone } from '../../shared/messageDedup.js';
import {
  computeOnboardingOptInView,
  hasWelcomeMessageSent,
  welcomeSentAtFromMessages,
} from '../../shared/onboardingStatus.js';

export const FOLLOWUP_COMPLETED_TAG = 'Follow-up completed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DOLCE_DB_PATH
  ? path.resolve(process.env.DOLCE_DB_PATH)
  : path.join(__dirname, '..', 'data', 'contacts.db');

/** Resolved absolute SQLite path — website and MCP must share this file. */
export const DB_PATH = dbPath;

// stderr only: MCP uses stdout for the protocol; API logs capture stderr too.
console.error('[db] using', dbPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    source_image TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    tag TEXT DEFAULT 'Dolce Sicilia Customer Base',
    customer_type TEXT DEFAULT 'first_time',
    order_count INTEGER DEFAULT 1,
    last_seen_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_log (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    template_id TEXT,
    template_name TEXT,
    message_body TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaign_enrollments (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL UNIQUE,
    campaign_id TEXT NOT NULL DEFAULT 'first-visit-feedback',
    current_step TEXT DEFAULT 'ready_msg1',
    waiting_for TEXT,
    answers TEXT DEFAULT '{}',
    enrolled_at TEXT DEFAULT (datetime('now')),
    last_sent_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_message_log_contact ON message_log(contact_id);
  CREATE INDEX IF NOT EXISTS idx_message_log_template ON message_log(contact_id, template_id);
  CREATE INDEX IF NOT EXISTS idx_campaign_step ON campaign_enrollments(current_step);

  CREATE TABLE IF NOT EXISTS whatsapp_interactions (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    phone TEXT,
    direction TEXT NOT NULL,
    message_type TEXT,
    body TEXT,
    campaign_step TEXT,
    reply_key TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wa_interactions_contact ON whatsapp_interactions(contact_id);
  CREATE INDEX IF NOT EXISTS idx_wa_interactions_created ON whatsapp_interactions(created_at);

  CREATE TABLE IF NOT EXISTS customer_orders (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    ordered_at TEXT NOT NULL,
    screenshot_at TEXT,
    source_image TEXT,
    timestamp_source TEXT DEFAULT 'screenshot',
    is_first_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_contact ON customer_orders(contact_id);
  CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON customer_orders(ordered_at);

  CREATE TABLE IF NOT EXISTS order_screenshots (
    id TEXT PRIMARY KEY,
    original_filename TEXT,
    file_path TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    ocr_text TEXT,
    image_capture_ms INTEGER,
    ordered_at TEXT,
    order_value REAL,
    currency TEXT DEFAULT 'SGD',
    value_source TEXT,
    timestamp_source TEXT,
    contacts_json TEXT,
    contact_id TEXT,
    order_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (order_id) REFERENCES customer_orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_screenshots_contact ON order_screenshots(contact_id);
  CREATE INDEX IF NOT EXISTS idx_screenshots_order ON order_screenshots(order_id);

  CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    body TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    message_body TEXT NOT NULL,
    template_id TEXT,
    template_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
  CREATE INDEX IF NOT EXISTS idx_message_queue_contact ON message_queue(contact_id);
`);

function seedBuiltinMessageTemplates() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM message_templates').get();
  if (n > 0) return;
  const insert = db.prepare(`
    INSERT INTO message_templates (id, name, description, body, is_builtin)
    VALUES (?, ?, ?, ?, 1)
  `);
  for (const t of MESSAGE_TEMPLATES) {
    insert.run(t.id, t.name, t.description, t.body);
  }
}
seedBuiltinMessageTemplates();

const templateCols = db.prepare(`PRAGMA table_info(message_templates)`).all().map((c) => c.name);
if (!templateCols.includes('target_segment')) {
  db.exec(`ALTER TABLE message_templates ADD COLUMN target_segment TEXT`);
}
if (!templateCols.includes('campaign_type')) {
  db.exec(`ALTER TABLE message_templates ADD COLUMN campaign_type TEXT`);
}
db.prepare(
  `UPDATE message_templates SET target_segment = 'vip'
   WHERE target_segment IS NULL AND (LOWER(name) LIKE '%vip%' OR LOWER(id) LIKE '%vip%')`,
).run();
db.prepare(
  `UPDATE message_templates SET target_segment = 'first-time'
   WHERE id = 'welcome-first-order' AND target_segment IS NULL`,
).run();

const orderCols = db.prepare(`PRAGMA table_info(customer_orders)`).all().map((c) => c.name);
if (!orderCols.includes('order_value')) {
  db.exec(`ALTER TABLE customer_orders ADD COLUMN order_value REAL`);
}
if (!orderCols.includes('currency')) {
  db.exec(`ALTER TABLE customer_orders ADD COLUMN currency TEXT DEFAULT 'SGD'`);
}
if (!orderCols.includes('value_source')) {
  db.exec(`ALTER TABLE customer_orders ADD COLUMN value_source TEXT`);
}
if (!orderCols.includes('screenshot_id')) {
  db.exec(`ALTER TABLE customer_orders ADD COLUMN screenshot_id TEXT`);
}

// Migrate older DBs — add each column individually
const cols = db.prepare(`PRAGMA table_info(contacts)`).all().map((c) => c.name);
if (!cols.includes('customer_type')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN customer_type TEXT DEFAULT 'first_time'`);
}
if (!cols.includes('order_count')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN order_count INTEGER DEFAULT 1`);
}
if (!cols.includes('last_seen_at')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN last_seen_at TEXT`);
  db.exec(`UPDATE contacts SET last_seen_at = datetime('now') WHERE last_seen_at IS NULL`);
}
if (!cols.includes('followup_status')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN followup_status TEXT`);
}
if (!cols.includes('message_pref')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN message_pref TEXT DEFAULT 'unset'`);
}
if (!cols.includes('message_pref_updated_at')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN message_pref_updated_at TEXT`);
}
if (!cols.includes('last_launch_sent_at')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN last_launch_sent_at TEXT`);
}
if (!cols.includes('end_of_day_optin')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN end_of_day_optin INTEGER DEFAULT 0`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS onboarding_schedule (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL UNIQUE,
    order_id TEXT,
    deliver_after TEXT NOT NULL,
    sent_at TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );
  CREATE INDEX IF NOT EXISTS idx_onboarding_deliver ON onboarding_schedule(deliver_after, status);
`);

// Sync schedule rows that already have a logged Neighbourhood Welcome send
db.exec(`
  UPDATE onboarding_schedule
  SET status = 'sent',
      sent_at = COALESCE(
        sent_at,
        (SELECT MAX(sent_at) FROM message_log ml
         WHERE ml.contact_id = onboarding_schedule.contact_id
           AND ml.template_id = '${PREFERENCE_POLL_TEMPLATE_ID}'),
        datetime('now')
      )
  WHERE status = 'pending'
    AND contact_id IN (
      SELECT contact_id FROM message_log WHERE template_id = '${PREFERENCE_POLL_TEMPLATE_ID}'
    );
`);
db.exec(`
  UPDATE contacts SET followup_status = 'completed'
  WHERE id IN (
    SELECT contact_id FROM message_log WHERE template_id = '${PREFERENCE_POLL_TEMPLATE_ID}'
  )
  AND followup_status = 'active';
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wholesale_leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    zone TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    instagram TEXT,
    website TEXT,
    lat REAL,
    lng REAL,
    fit_note TEXT,
    priority INTEGER,
    status TEXT DEFAULT 'new',
    last_contacted_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wholesale_outreach (
    id TEXT PRIMARY KEY,
    lead_id TEXT,
    channel TEXT DEFAULT 'whatsapp',
    direction TEXT,
    body TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    sent_at TEXT,
    FOREIGN KEY (lead_id) REFERENCES wholesale_leads(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wholesale_leads_zone ON wholesale_leads(zone);
  CREATE INDEX IF NOT EXISTS idx_wholesale_leads_status ON wholesale_leads(status);
  CREATE INDEX IF NOT EXISTS idx_wholesale_outreach_lead ON wholesale_outreach(lead_id);
  CREATE INDEX IF NOT EXISTS idx_wholesale_outreach_status ON wholesale_outreach(status);
`);

const wholesaleOutreachCols = db
  .prepare(`PRAGMA table_info(wholesale_outreach)`)
  .all()
  .map((c) => c.name);
if (!wholesaleOutreachCols.includes('read_at')) {
  db.exec(`ALTER TABLE wholesale_outreach ADD COLUMN read_at TEXT`);
}

const WHOLESALE_SEED_LEADS = [
  {
    id: 'wh-generation-coffee',
    name: 'Generation Coffee Roasters',
    type: 'Specialty roaster (wholesale)',
    zone: 'Tanjong Pagar/CBD',
    address: '6 Tanjong Pagar Plaza #02-14',
    phone: '+65 8891 2911',
    email: '(site form)',
    instagram: '@generationcoffeesg',
    website: 'generationcoffee.sg',
    lat: 1.2766,
    lng: 103.8438,
    priority: 1,
    fit_note: 'Already runs wholesale — warmest lead; coffee + tiramisù pairing',
  },
  {
    id: 'wh-foreground-coffee',
    name: 'Foreground Coffee',
    type: 'Specialty coffee + bites',
    zone: 'Tanjong Pagar/CBD',
    address: '1 Tanjong Pagar Plaza #02-06',
    phone: '+65 9738 1276',
    email: 'business@foreground.sg',
    instagram: '@foregroundcoffeesg',
    website: 'foreground.sg',
    lat: 1.2768,
    lng: 103.8436,
    priority: 2,
    fit_note: 'Dedicated business email; dessert-friendly, CBD footfall',
  },
  {
    id: 'wh-five-oars',
    name: 'Five Oars Coffee Roasters',
    type: 'Aussie specialty roaster',
    zone: 'Tanjong Pagar/CBD',
    address: '43 Tanjong Pagar Rd #01-01',
    phone: '+65 8784 2686',
    email: 'hi@focr.sg',
    instagram: '@focr.sg',
    website: 'focr.sg',
    lat: 1.2773,
    lng: 103.843,
    priority: 3,
    fit_note: 'Established roaster, brunch crowd, values craft',
  },
  {
    id: 'wh-cafe-kreams',
    name: 'Cafe Kreams',
    type: 'Dessert-forward café',
    zone: 'Tanjong Pagar/CBD',
    address: '32 Maxwell Rd #01-07 Maxwell Chambers',
    phone: '+65 9673 2307',
    email: 'admin@mininve.com',
    instagram: '@cafekreams',
    website: 'kreams.sg',
    lat: 1.2802,
    lng: 103.8456,
    priority: 4,
    fit_note: 'High footfall, Instagrammable, dessert-led',
  },
  {
    id: 'wh-coffee-code',
    name: 'The Coffee Code',
    type: 'Malaysian café (waffles/desserts)',
    zone: 'Tanjong Pagar/CBD',
    address: '37 Neil Rd 088822',
    phone: '+65 8208 9500',
    email: '(IG DM)',
    instagram: '@thecoffeecodesingapore',
    website: '—',
    lat: 1.2796,
    lng: 103.842,
    priority: 5,
    fit_note: 'Dessert-led, open late',
  },
  {
    id: 'wh-koki',
    name: 'Kōki Alternative Bread Bar',
    type: 'Artisan bakery / brew bar',
    zone: 'Tanjong Pagar/CBD',
    address: '60A Duxton Rd #02-01 089524',
    phone: '(IG DM)',
    email: '(IG)',
    instagram: '@koki.singapore',
    website: '—',
    lat: 1.2792,
    lng: 103.841,
    priority: 6,
    fit_note: 'Artisan crowd; DM-only contact',
  },
];

function seedWholesaleLeads() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM wholesale_leads').get();
  if (n > 0) return;
  const insert = db.prepare(`
    INSERT INTO wholesale_leads (
      id, name, type, zone, address, phone, email, instagram, website,
      lat, lng, fit_note, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `);
  for (const lead of WHOLESALE_SEED_LEADS) {
    insert.run(
      lead.id,
      lead.name,
      lead.type,
      lead.zone,
      lead.address,
      lead.phone,
      lead.email,
      lead.instagram,
      lead.website,
      lead.lat,
      lead.lng,
      lead.fit_note,
      lead.priority,
    );
  }
}
seedWholesaleLeads();

function upsertOnboardingTemplate() {
  const existing = db.prepare('SELECT id FROM message_templates WHERE id = ?').get(ONBOARDING_TEMPLATE_ID);
  if (existing) {
    db.prepare(
      `UPDATE message_templates SET name = ?, description = ?, body = ? WHERE id = ?`,
    ).run(
      'Neighbourhood Welcome — opt-in',
      'First-order onboarding: Chef Luca intro + preference poll (~2h after delivery)',
      ONBOARDING_INTRO_BODY,
      ONBOARDING_TEMPLATE_ID,
    );
  } else {
    db.prepare(
      `INSERT INTO message_templates (id, name, description, body, is_builtin) VALUES (?, ?, ?, ?, 1)`,
    ).run(
      ONBOARDING_TEMPLATE_ID,
      'Neighbourhood Welcome — opt-in',
      'First-order onboarding: Chef Luca intro + preference poll (~2h after delivery)',
      ONBOARDING_INTRO_BODY,
    );
  }
}
upsertOnboardingTemplate();

function normalizeContactRow(c) {
  if (!c) return null;
  return {
    ...c,
    message_pref: c.message_pref || 'unset',
    end_of_day_optin: !!c.end_of_day_optin,
  };
}

// Backfill completed follow-ups
db.exec(`
  UPDATE contacts SET followup_status = 'completed'
  WHERE id IN (SELECT contact_id FROM campaign_enrollments WHERE completed_at IS NOT NULL)
    AND (followup_status IS NULL OR followup_status = '')
`);
db.exec(`
  UPDATE contacts SET followup_status = 'active'
  WHERE id IN (SELECT contact_id FROM campaign_enrollments WHERE completed_at IS NULL)
    AND (followup_status IS NULL OR followup_status = '')
`);

function normalizeOrderAt(isoOrLocal) {
  return String(isoOrLocal || '').replace('T', ' ').replace('Z', '').replace(/\.\d{3}/, '').slice(0, 19);
}

function findDuplicateOrder(contactId, sourceImage, orderedAt) {
  if (sourceImage) {
    return db.prepare(
      'SELECT id FROM customer_orders WHERE contact_id = ? AND source_image = ?',
    ).get(contactId, sourceImage);
  }
  if (orderedAt) {
    const key = normalizeOrderAt(orderedAt).slice(0, 16);
    return db.prepare(`
      SELECT id FROM customer_orders
      WHERE contact_id = ?
        AND substr(replace(replace(ordered_at, 'T', ' '), 'Z', ''), 1, 16) = ?
    `).get(contactId, key);
  }
  return null;
}

/** Drop fake backfill / pre-EXIF orders and sync contact counts from real EXIF rows. */
function reconcileOrderData() {
  db.prepare(`
    DELETE FROM customer_orders
    WHERE timestamp_source = 'unknown' OR (source_image IS NULL AND timestamp_source != 'exif')
  `).run();

  const contacts = db.prepare('SELECT id FROM contacts').all();
  for (const { id } of contacts) {
    const orders = db.prepare(`
      SELECT id, ordered_at FROM customer_orders WHERE contact_id = ?
      ORDER BY ordered_at ASC
    `).all(id);

    db.prepare('UPDATE customer_orders SET is_first_order = 0 WHERE contact_id = ?').run(id);
    if (orders.length > 0) {
      db.prepare('UPDATE customer_orders SET is_first_order = 1 WHERE id = ?').run(orders[0].id);
      const lastAt = normalizeOrderAt(orders[orders.length - 1].ordered_at);
      db.prepare(`
        UPDATE contacts SET
          order_count = ?,
          customer_type = ?,
          last_seen_at = ?
        WHERE id = ?
      `).run(orders.length, orders.length > 1 ? 'returning' : 'first_time', lastAt, id);
    } else {
      db.prepare(`
        UPDATE contacts SET order_count = 0, customer_type = 'first_time' WHERE id = ?
      `).run(id);
    }
  }
}

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('65') && digits.length >= 10) return `+${digits}`;
  if (digits.length === 8 && /^[689]/.test(digits)) return `+65${digits}`;
  return `+${digits}`;
}

function isPendingPhone(phone) {
  return String(phone || '').startsWith('pending-');
}

export function formatPhoneForDisplay(phone) {
  if (!phone || isPendingPhone(phone)) return '';
  return phone;
}

export { normalizePhone, isPendingPhone };

export function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

if (getSetting('orders_reconciled_exif_v1', '') !== 'done') {
  reconcileOrderData();
  setSetting('orders_reconciled_exif_v1', 'done');
}

// Manual-only — no automatic outbound until you explicitly ask to re-enable.
setSetting('auto_send_enabled', 'false');
setSetting('followup_campaign_enabled', 'false');

export function isFollowupCampaignEnabled() {
  return getSetting('followup_campaign_enabled', 'false') === 'true';
}

/** Alias — same setting key, now controls first-order onboarding. */
export const isOnboardingEnabled = isFollowupCampaignEnabled;

export function getContactById(id) {
  return normalizeContactRow(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

export function findContactByPhone(phone) {
  const normalized = normalizePhone(phone);
  const c = db.prepare(`
    SELECT * FROM contacts
    WHERE phone = ? OR phone = ? OR replace(replace(phone, ' ', ''), '+', '') = replace(?, '+', '')
  `).get(normalized, phone, normalized);
  return normalizeContactRow(c);
}

function findContactByNamePending(name) {
  if (!name?.trim()) return null;
  return db.prepare(`
    SELECT * FROM contacts
    WHERE lower(trim(name)) = lower(trim(?)) AND phone LIKE 'pending-%'
  `).get(name);
}

function resolveSavePhone(c, id) {
  const raw = String(c.phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8) return normalizePhone(raw);
  return `pending-${id}`;
}

export function listContacts() {
  const rows = db.prepare('SELECT * FROM contacts ORDER BY last_seen_at DESC').all();
  const schedules = db.prepare(
    'SELECT contact_id, status, sent_at, deliver_after FROM onboarding_schedule',
  ).all();
  const scheduleByContact = new Map(schedules.map((s) => [s.contact_id, s]));
  const welcomeSentIds = new Set(
    db.prepare(
      'SELECT contact_id FROM message_log WHERE template_id = ?',
    ).all(PREFERENCE_POLL_TEMPLATE_ID).map((r) => r.contact_id),
  );

  return rows.map((c) => {
    const normalized = normalizeContactRow(c);
    const extra = enrichContactOnboarding(normalized, { scheduleByContact, welcomeSentIds });
    return {
      ...normalized,
      ...extra,
      displayTags: buildDisplayTags({ ...normalized, ...extra }),
    };
  });
}

export function listContactsWithMessages() {
  const schedules = db.prepare(
    'SELECT contact_id, status, sent_at, deliver_after FROM onboarding_schedule',
  ).all();
  const scheduleByContact = new Map(schedules.map((s) => [s.contact_id, s]));
  const welcomeSentIds = new Set(
    db.prepare(
      'SELECT contact_id FROM message_log WHERE template_id = ?',
    ).all(PREFERENCE_POLL_TEMPLATE_ID).map((r) => r.contact_id),
  );

  const rows = db.prepare('SELECT * FROM contacts ORDER BY last_seen_at DESC').all();
  const logs = db.prepare(`
    SELECT contact_id, template_id, template_name, sent_at
    FROM message_log ORDER BY sent_at DESC
  `).all();

  const byContact = new Map();
  for (const log of logs) {
    if (!byContact.has(log.contact_id)) byContact.set(log.contact_id, []);
    const existing = byContact.get(log.contact_id);
    if (!existing.some((e) => e.template_id === log.template_id)) {
      existing.push(log);
    }
  }

  const enrollments = db.prepare('SELECT * FROM campaign_enrollments').all();
  const byEnrollment = new Map(enrollments.map((e) => [e.contact_id, e]));

  return rows.map((c) => {
    const normalized = normalizeContactRow(c);
    const sentMessages = byContact.get(c.id) || [];
    const extra = enrichContactOnboarding(normalized, {
      scheduleByContact,
      welcomeSentIds,
      sentMessages,
    });
    const merged = { ...normalized, ...extra };
    return {
      ...merged,
      sentMessages,
      sentLogSummary: getContactSentLogSummary(c.id, 40),
      campaign: (() => {
        const enrollment = byEnrollment.get(c.id);
        if (!enrollment) return null;
        const answers = JSON.parse(enrollment.answers || '{}');
        return { ...enrollment, answers: parseAnswersForDisplay(answers) };
      })(),
      displayTags: buildDisplayTags(merged),
      orderStats: getContactOrderStats(c.id),
      orders: getContactOrders(c.id).slice(0, 5),
    };
  });
}

export function getContactOrders(contactId) {
  return db.prepare(`
    SELECT * FROM customer_orders WHERE contact_id = ?
    ORDER BY ordered_at DESC
  `).all(contactId);
}

export function getContactOrderStats(contactId) {
  const rows = db.prepare(`
    SELECT ordered_at, is_first_order, order_value FROM customer_orders
    WHERE contact_id = ? ORDER BY ordered_at ASC
  `).all(contactId);
  if (!rows.length) return null;
  const values = rows.map((r) => r.order_value).filter((v) => v != null && v > 0);
  const totalValue = values.reduce((s, v) => s + v, 0);
  return {
    count: rows.length,
    firstOrderAt: rows[0].ordered_at,
    lastOrderAt: rows[rows.length - 1].ordered_at,
    totalValue: Math.round(totalValue * 100) / 100,
    avgOrderValue: values.length ? Math.round((totalValue / values.length) * 100) / 100 : null,
    firstOrderValue: rows[0].order_value ?? null,
    maxOrderValue: values.length ? Math.max(...values) : null,
    ordersWithValue: values.length,
  };
}

export function recordCustomerOrder({
  contactId,
  orderedAt,
  screenshotAt,
  sourceImage,
  timestampSource,
  isFirstOrder,
  orderValue,
  currency,
  valueSource,
  screenshotId,
}) {
  const at = orderedAt || new Date().toISOString();
  if (findDuplicateOrder(contactId, sourceImage, at)) {
    return { inserted: false, duplicate: true };
  }

  const orderCount = db.prepare(
    'SELECT COUNT(*) as n FROM customer_orders WHERE contact_id = ?',
  ).get(contactId).n;
  const firstOrder = orderCount === 0;

  let resolvedValue = orderValue;
  let resolvedCurrency = currency;
  let resolvedValueSource = valueSource;
  if (screenshotId && (resolvedValue == null || resolvedValue <= 0)) {
    const shot = db.prepare(
      'SELECT order_value, currency, value_source, ordered_at, timestamp_source FROM order_screenshots WHERE id = ?',
    ).get(screenshotId);
    if (shot) {
      if (shot.order_value != null && shot.order_value > 0) resolvedValue = shot.order_value;
      if (shot.currency) resolvedCurrency = shot.currency;
      if (shot.value_source) resolvedValueSource = shot.value_source;
    }
  }

  const orderId = uniqueId();
  db.prepare(`
    INSERT INTO customer_orders
      (id, contact_id, ordered_at, screenshot_at, source_image, timestamp_source, is_first_order, order_value, currency, value_source, screenshot_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId,
    contactId,
    at,
    screenshotAt || null,
    sourceImage || null,
    timestampSource || 'exif',
    firstOrder ? 1 : 0,
    resolvedValue != null && resolvedValue > 0 ? resolvedValue : null,
    resolvedCurrency || 'SGD',
    resolvedValueSource || null,
    screenshotId || null,
  );
  db.prepare(`
    UPDATE contacts SET last_seen_at = ? WHERE id = ?
  `).run(normalizeOrderAt(at), contactId);

  if (screenshotId) {
    linkScreenshotToOrder(db, screenshotId, { contactId, orderId });
  }

  return { inserted: true, duplicate: false, isFirstOrder: firstOrder, orderId };
}

export function listAllOrders() {
  return db.prepare(`
    SELECT o.*, c.name, c.phone, c.customer_type
    FROM customer_orders o
    JOIN contacts c ON c.id = o.contact_id
    ORDER BY o.ordered_at DESC
  `).all();
}

function parseAnswersForDisplay(answers) {
  const out = {};
  for (const [key, raw] of Object.entries(answers)) {
    const formatted = formatStoredAnswer(raw);
    if (formatted) {
      const resolved = answerLabelFor(key, formatted.value);
      const useStored =
        formatted.label &&
        formatted.label !== formatted.value &&
        !/^[1-4]$/.test(formatted.label) &&
        formatted.label !== 'done';
      out[key] = {
        ...formatted,
        label: useStored ? formatted.label : resolved,
      };
    }
  }
  return out;
}

export function buildDisplayTags(contact) {
  const tags = [contact.tag || 'Dolce Sicilia Customer Base'];
  const view = computeOnboardingOptInView({
    message_pref: contact.message_pref,
    message_pref_updated_at: contact.message_pref_updated_at,
    end_of_day_optin: contact.end_of_day_optin,
    welcomeSent: contact.welcomeSent,
    welcomeSentAt: contact.welcomeSentAt,
    onboardingScheduleStatus: contact.onboardingScheduleStatus,
  });
  tags.push(view.summary);
  return tags;
}

function enrichContactOnboarding(contact, { scheduleByContact, welcomeSentIds, sentMessages }) {
  const schedule = scheduleByContact?.get(contact.id);
  const welcomeSent =
    welcomeSentIds?.has(contact.id) ||
    hasWelcomeMessageSent(sentMessages) ||
    schedule?.status === 'sent';
  const welcomeSentAt =
    welcomeSentAtFromMessages(sentMessages) ||
    schedule?.sent_at ||
    null;
  const optInView = computeOnboardingOptInView({
    message_pref: contact.message_pref,
    message_pref_updated_at: contact.message_pref_updated_at,
    end_of_day_optin: contact.end_of_day_optin,
    welcomeSent,
    welcomeSentAt,
    onboardingScheduleStatus: schedule?.status || null,
    followup_status: contact.followup_status,
  });
  return {
    welcomeSent,
    welcomeSentAt,
    onboardingScheduleStatus: schedule?.status || null,
    onboardingDeliverAfter: schedule?.deliver_after || null,
    optInView,
  };
}

export function setFollowupStatus(contactId, status) {
  db.prepare('UPDATE contacts SET followup_status = ? WHERE id = ?').run(status, contactId);
}

export function hasOnboardingBeenSent(contactId) {
  const row = db.prepare(
    `SELECT 1 FROM message_log WHERE contact_id = ? AND template_id = ? LIMIT 1`,
  ).get(contactId, PREFERENCE_POLL_TEMPLATE_ID);
  return !!row;
}

export function scheduleOnboarding(contactId, orderId, orderedAt) {
  if (!isOnboardingEnabled()) return false;
  if (hasOnboardingBeenSent(contactId)) return false;

  const contact = getContactById(contactId);
  if (!contact) return false;
  if (contact.message_pref && contact.message_pref !== 'unset') return false;

  const existing = db.prepare(
    'SELECT id, status FROM onboarding_schedule WHERE contact_id = ?',
  ).get(contactId);
  if (existing?.status === 'sent') return false;

  const deliverAfter = onboardingDeliverAfterIso(orderedAt);
  if (existing) {
    db.prepare(
      `UPDATE onboarding_schedule SET order_id = ?, deliver_after = ?, status = 'pending', sent_at = NULL WHERE contact_id = ?`,
    ).run(orderId || null, deliverAfter, contactId);
  } else {
    db.prepare(
      `INSERT INTO onboarding_schedule (id, contact_id, order_id, deliver_after, status) VALUES (?, ?, ?, ?, 'pending')`,
    ).run(uniqueId(), contactId, orderId || null, deliverAfter);
  }
  setFollowupStatus(contactId, 'active');
  return true;
}

export function markOnboardingSent(contactId) {
  db.prepare(
    `UPDATE onboarding_schedule SET status = 'sent', sent_at = datetime('now') WHERE contact_id = ?`,
  ).run(contactId);
  setFollowupStatus(contactId, 'completed');
}

export function markOnboardingFailed(contactId) {
  db.prepare(
    `UPDATE onboarding_schedule SET status = 'failed' WHERE contact_id = ?`,
  ).run(contactId);
}

export function listOnboardingQueue() {
  return db.prepare(`
    SELECT c.id, c.name, c.phone, c.customer_type, c.message_pref, c.end_of_day_optin,
           o.id AS schedule_id, o.order_id, o.deliver_after, o.sent_at, o.status, o.created_at AS scheduled_at
    FROM onboarding_schedule o
    JOIN contacts c ON c.id = o.contact_id
    WHERE o.status IN ('pending', 'failed')
    ORDER BY o.deliver_after ASC
  `).all().map((row) => ({
    ...normalizeContactRow(row),
    deliver_after: row.deliver_after,
    scheduled_at: row.scheduled_at,
    is_due: new Date(row.deliver_after).getTime() <= Date.now(),
  }));
}

export function listDueOnboarding() {
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT c.id, c.name, c.phone, o.deliver_after, o.order_id
    FROM onboarding_schedule o
    JOIN contacts c ON c.id = o.contact_id
    WHERE o.status = 'pending' AND o.deliver_after <= ?
    ORDER BY o.deliver_after ASC
  `).all(nowIso);
}

export function listFirstTimeWithoutOnboarding() {
  return db.prepare(`
    SELECT c.id, c.name, c.phone, c.customer_type, c.order_count, c.last_seen_at
    FROM contacts c
    LEFT JOIN onboarding_schedule o ON o.contact_id = c.id
    WHERE c.customer_type = 'first_time'
      AND o.id IS NULL
      AND (c.message_pref IS NULL OR c.message_pref = 'unset')
      AND NOT EXISTS (
        SELECT 1 FROM message_log ml
        WHERE ml.contact_id = c.id AND ml.template_id = ?
      )
    ORDER BY c.last_seen_at DESC
  `).all(PREFERENCE_POLL_TEMPLATE_ID);
}

/** First order yesterday or today (Singapore) — Neighbourhood Welcome not logged yet. */
export function listPendingOnboardingManual() {
  const today = todayKeySg();
  const yesterday = addDayKey(today, -1);
  return db
    .prepare(
      `
    SELECT c.id, c.name, c.phone, c.customer_type, c.order_count, c.last_seen_at,
           fo.first_order_day
    FROM contacts c
    INNER JOIN (
      SELECT contact_id,
             MIN(substr(replace(replace(ordered_at, 'T', ' '), 'Z', ''), 1, 10)) AS first_order_day
      FROM customer_orders
      GROUP BY contact_id
    ) fo ON fo.contact_id = c.id
    WHERE fo.first_order_day IN (?, ?)
      AND NOT EXISTS (
        SELECT 1 FROM message_log ml
        WHERE ml.contact_id = c.id AND ml.template_id = ?
      )
    ORDER BY fo.first_order_day DESC, c.last_seen_at DESC
  `,
    )
    .all(yesterday, today, PREFERENCE_POLL_TEMPLATE_ID)
    .map((row) => normalizeContactRow(row));
}

/** @deprecated First-visit survey retired — schedules onboarding instead. */
function enrollInCampaign(_contactId) {
  return false;
}

/** Schedule onboarding for first-time customers missing a row (replaces survey enroll). */
export function syncCampaignEnrollments() {
  if (!isOnboardingEnabled()) {
    return { enrolled: [], scheduled: [], skipped: 0, reason: 'onboarding_disabled' };
  }
  const missing = listFirstTimeWithoutOnboarding();
  const scheduled = [];
  for (const c of missing) {
    const order = db.prepare(
      `SELECT id, ordered_at FROM customer_orders WHERE contact_id = ? ORDER BY ordered_at DESC LIMIT 1`,
    ).get(c.id);
    if (order && scheduleOnboarding(c.id, order.id, order.ordered_at)) {
      scheduled.push(c);
    }
  }
  return { enrolled: scheduled, scheduled, skipped: missing.length - scheduled.length };
}

export function listNotEnrolledFirstTime() {
  return listFirstTimeWithoutOnboarding();
}

export function getCampaignEnrollmentSummary() {
  const totalFirstTime = db.prepare(
    `SELECT COUNT(*) as n FROM contacts WHERE customer_type = 'first_time'`,
  ).get().n;
  const inQueue = db.prepare(
    `SELECT COUNT(*) as n FROM onboarding_schedule WHERE status = 'pending'`,
  ).get().n;
  const completed = db.prepare(
    `SELECT COUNT(*) as n FROM onboarding_schedule WHERE status = 'sent'`,
  ).get().n;
  const legacyInQueue = db.prepare(
    `SELECT COUNT(*) as n FROM campaign_enrollments WHERE completed_at IS NULL`,
  ).get().n;
  const pendingEnrollment = listFirstTimeWithoutOnboarding();
  return {
    totalFirstTime,
    inQueue,
    completed,
    notEnrolled: pendingEnrollment.length,
    pendingEnrollment,
    legacyCampaignInQueue: legacyInQueue,
  };
}

export function listEndOfDayAudience(minDaysBetween = 7) {
  const contacts = listContactsWithMessages();
  return contacts.filter((c) => {
    if (!c.end_of_day_optin) return false;
    if (c.message_pref === 'opt_out') return false;
    if (!isMessageDedupExemptPhone(c.phone) && isContactRecentlyMessaged(c.id, minDaysBetween)) {
      return false;
    }
    return true;
  });
}

export function saveContacts(contacts, options = {}) {
  const autoEnroll = options.autoEnrollCampaign ?? isFollowupCampaignEnabled();
  const insert = db.prepare(`
    INSERT INTO contacts (id, name, phone, source_image, tag, customer_type, order_count)
    VALUES (@id, @name, @phone, @source_image, @tag, 'first_time', 1)
  `);

  const updateReturning = db.prepare(`
    UPDATE contacts SET
      order_count = order_count + 1,
      customer_type = 'returning',
      source_image = COALESCE(@source_image, source_image)
    WHERE phone = @phone
  `);

  const results = { new: [], returning: [], enrolled: [], scheduledOnboarding: [], skipped: [] };

  const saveMany = db.transaction((items) => {
    for (const c of items) {
      const id = c.id || uniqueId();
      const phone = resolveSavePhone(c, id);
      const existing = isPendingPhone(phone)
        ? findContactByNamePending(c.name)
        : findContactByPhone(phone);

      const orderedAt = c.orderedAt || new Date().toISOString();

      if (existing) {
        const orderResult = recordCustomerOrder({
          contactId: existing.id,
          orderedAt,
          screenshotAt: c.screenshotAt || null,
          sourceImage: c.sourceImage || null,
          timestampSource: c.timestampSource || 'exif',
          orderValue: c.orderValue,
          currency: c.currency,
          valueSource: c.valueSource,
          screenshotId: c.screenshotId || null,
        });
        if (!orderResult.inserted) {
          results.skipped.push({
            id: existing.id,
            name: existing.name,
            phone: existing.phone,
            reason: 'duplicate_order',
          });
          continue;
        }
        updateReturning.run({
          phone: existing.phone,
          source_image: c.sourceImage || null,
        });
        const newCount = existing.order_count + 1;
        results.returning.push({
          id: existing.id,
          name: existing.name,
          phone: existing.phone,
          customer_type: 'returning',
          order_count: newCount,
          orderedAt,
        });
      } else {
        insert.run({
          id,
          name: c.name,
          phone,
          source_image: c.sourceImage || null,
          tag: c.tag || 'Dolce Sicilia Customer Base',
        });
        const orderResult = recordCustomerOrder({
          contactId: id,
          orderedAt,
          screenshotAt: c.screenshotAt || null,
          sourceImage: c.sourceImage || null,
          timestampSource: c.timestampSource || 'exif',
          orderValue: c.orderValue,
          currency: c.currency,
          valueSource: c.valueSource,
          screenshotId: c.screenshotId || null,
        });
        if (!orderResult.inserted) {
          results.skipped.push({ id, name: c.name, phone, reason: 'duplicate_order' });
          continue;
        }
        const saved = { id, name: c.name, phone, customer_type: 'first_time', order_count: 1, orderedAt };
        results.new.push(saved);

        if (autoEnroll && orderResult.isFirstOrder) {
          scheduleOnboarding(id, orderResult.orderId, orderedAt);
          results.scheduledOnboarding.push(id);
        }
      }
    }
    return results;
  });

  return saveMany(contacts);
}

export function checkPhones(phones) {
  return phones.map((phone) => {
    const existing = findContactByPhone(phone);
    return {
      phone: normalizePhone(phone),
      exists: !!existing,
      customer_type: existing?.customer_type ?? null,
      name: existing?.name ?? null,
      order_count: existing?.order_count ?? 0,
    };
  });
}

export function deleteContact(id) {
  db.prepare('DELETE FROM customer_orders WHERE contact_id = ?').run(id);
  db.prepare('DELETE FROM campaign_enrollments WHERE contact_id = ?').run(id);
  return db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}

export function logWhatsAppInteraction({
  contactId,
  phone,
  direction,
  messageType,
  body,
  campaignStep,
  replyKey,
}) {
  const id = uniqueId();
  db.prepare(`
    INSERT INTO whatsapp_interactions
      (id, contact_id, phone, direction, message_type, body, campaign_step, reply_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    contactId || null,
    phone || null,
    direction,
    messageType || null,
    body || '',
    campaignStep || null,
    replyKey || null,
  );
  return { id, contactId, direction, body, createdAt: new Date().toISOString() };
}

export function getWhatsAppInteractions(contactId) {
  return db.prepare(`
    SELECT * FROM whatsapp_interactions
    WHERE contact_id = ?
    ORDER BY created_at DESC
  `).all(contactId);
}

export function listCampaignResults() {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.customer_type, c.followup_status, c.tag,
           e.current_step, e.waiting_for, e.answers, e.enrolled_at,
           e.last_sent_at, e.completed_at
    FROM campaign_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    ORDER BY e.enrolled_at DESC
  `).all();

  const interactionCounts = db.prepare(`
    SELECT contact_id, COUNT(*) as count
    FROM whatsapp_interactions GROUP BY contact_id
  `).all();
  const counts = new Map(interactionCounts.map((r) => [r.contact_id, r.count]));

  return rows.map((row) => {
    const answers = parseAnswersForDisplay(JSON.parse(row.answers || '{}'));
    return {
      ...row,
      answers,
      interactionCount: counts.get(row.id) || 0,
      displayTags: buildDisplayTags(row),
    };
  });
}

export function logMessageSent({ contactId, templateId, templateName, messageBody }) {
  const id = uniqueId();
  db.prepare(`
    INSERT INTO message_log (id, contact_id, template_id, template_name, message_body)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, contactId, templateId || null, templateName || 'Custom', messageBody);
  return { id, contactId, templateId, templateName, sentAt: new Date().toISOString() };
}

export function getMessageLogs(contactId) {
  return db.prepare(`
    SELECT * FROM message_log WHERE contact_id = ? ORDER BY sent_at DESC
  `).all(contactId);
}

export function listWaitingEnrollments() {
  return db.prepare(`
    SELECT c.*, e.waiting_for, e.current_step
    FROM campaign_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.waiting_for IS NOT NULL AND e.completed_at IS NULL
  `).all();
}

export function listCampaignQueue() {
  return db.prepare(`
    SELECT c.*, e.id as enrollment_id, e.current_step, e.waiting_for, e.answers,
           e.enrolled_at, e.last_sent_at, e.completed_at
    FROM campaign_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.completed_at IS NULL
    ORDER BY e.enrolled_at ASC
  `).all().map((row) => ({
    ...row,
    answers: parseAnswersForDisplay(JSON.parse(row.answers || '{}')),
    displayTags: buildDisplayTags(row),
  }));
}

export function advanceCampaignSend(contactId, step, messageBody) {
  const enrollment = db.prepare(
    'SELECT * FROM campaign_enrollments WHERE contact_id = ?'
  ).get(contactId);
  if (!enrollment) return null;

  const stepFlow = {
    ready_msg1: { next: 'msg1_sent', wait: null },
    msg1_sent: { next: 'q1_sent', wait: 'q1' },
    q1_sent: { next: 'q2_sent', wait: 'q2' },
    q2_sent: { next: 'q3_sent', wait: 'q3' },
    q3_sent: { next: 'review_sent', wait: 'done' },
    review_sent: { next: 'completed', wait: null },
  };

  const flow = stepFlow[step];
  if (!flow) return null;

  const isComplete = flow.next === 'completed';

  db.prepare(`
    UPDATE campaign_enrollments SET
      current_step = ?,
      waiting_for = ?,
      last_sent_at = datetime('now'),
      completed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
    WHERE contact_id = ?
  `).run(flow.next, flow.wait, isComplete ? 1 : 0, contactId);

  if (isComplete) {
    setFollowupStatus(contactId, 'completed');
  }

  logMessageSent({
    contactId,
    templateId: `campaign-${step}`,
    templateName: step,
    messageBody,
  });

  return getEnrollment(contactId);
}

export function recordCampaignReply(contactId, replyKey, replyValue, replyMeta = {}) {
  const enrollment = db.prepare(
    'SELECT * FROM campaign_enrollments WHERE contact_id = ?'
  ).get(contactId);
  if (!enrollment) return null;

  const answers = JSON.parse(enrollment.answers || '{}');
  answers[replyKey] = {
    value: replyValue,
    label: replyMeta.label || answerLabelFor(replyKey, replyValue),
    raw: replyMeta.raw || null,
    at: new Date().toISOString(),
  };

  const advanceMap = {
    q1: 'msg1_sent',
    q2: 'q1_sent',
    q3: 'q2_sent',
    done: 'q3_sent',
  };

  const expectedStep = advanceMap[replyKey];
  let waiting_for = enrollment.waiting_for;

  if (enrollment.waiting_for === replyKey) {
    waiting_for = null;
  }

  db.prepare(`
    UPDATE campaign_enrollments SET answers = ?, waiting_for = ?
    WHERE contact_id = ?
  `).run(JSON.stringify(answers), waiting_for, contactId);

  return getEnrollment(contactId);
}

export function getEnrollment(contactId) {
  const row = db.prepare(`
    SELECT e.*, c.name, c.phone, c.customer_type
    FROM campaign_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.contact_id = ?
  `).get(contactId);
  if (!row) return null;
  const answers = JSON.parse(row.answers || '{}');
  return { ...row, answers: parseAnswersForDisplay(answers) };
}

export function resetCampaignEnrollment(contactId) {
  const existing = db.prepare(
    'SELECT id FROM campaign_enrollments WHERE contact_id = ?'
  ).get(contactId);
  if (!existing) {
    enrollInCampaign(contactId);
    return getEnrollment(contactId);
  }
  db.prepare(`
    UPDATE campaign_enrollments SET
      current_step = 'ready_msg1',
      waiting_for = NULL,
      answers = '{}',
      last_sent_at = NULL,
      completed_at = NULL
    WHERE contact_id = ?
  `).run(contactId);
  setFollowupStatus(contactId, 'active');
  db.prepare(
    `DELETE FROM message_log WHERE contact_id = ? AND template_id LIKE 'campaign-%'`
  ).run(contactId);
  return getEnrollment(contactId);
}

export function saveOrderScreenshot(payload) {
  return storeScreenshot(db, payload);
}

export function listOrderScreenshots() {
  return listScreenshots(db);
}

export async function reprocessOrderScreenshots() {
  return reprocessAllScreenshots(db);
}

export function resolveScreenshotPath(id) {
  return getScreenshotFilePath(db, id);
}

export async function reconcileOrderValuesFromArchive() {
  return reconcileOrderValues(db, normalizePhone);
}

function templateSlug(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
  return base || 'template';
}

export function listMessageTemplates() {
  return db
    .prepare(
      `SELECT id, name, description, body, target_segment AS targetSegment,
              campaign_type AS campaignType,
              is_builtin AS isBuiltin, created_at AS createdAt
       FROM message_templates
       ORDER BY is_builtin DESC, created_at ASC`,
    )
    .all();
}

export function getMessageTemplateById(id) {
  return db
    .prepare(
      `SELECT id, name, description, body, target_segment AS targetSegment,
              campaign_type AS campaignType,
              is_builtin AS isBuiltin, created_at AS createdAt
       FROM message_templates WHERE id = ?`,
    )
    .get(id);
}

export function saveMessageTemplate({ name, description, body, targetSegment }) {
  if (!name?.trim()) throw new Error('name is required');
  if (!body?.trim()) throw new Error('body is required');
  const id = `${templateSlug(name)}-${Date.now().toString(36).slice(-6)}`;
  db.prepare(
    `INSERT INTO message_templates (id, name, description, body, target_segment, is_builtin)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(id, name.trim(), description?.trim() || '', body.trim(), targetSegment?.trim() || null);
  return db
    .prepare(
      `SELECT id, name, description, body, target_segment AS targetSegment,
              is_builtin AS isBuiltin, created_at AS createdAt
       FROM message_templates WHERE id = ?`,
    )
    .get(id);
}

export function listMessageQueue(status = 'pending') {
  return db
    .prepare(
      `SELECT mq.id, mq.contact_id AS contactId, mq.message_body AS messageBody,
              mq.template_id AS templateId, mq.template_name AS templateName,
              mq.status, mq.created_at AS createdAt, c.name AS contactName
       FROM message_queue mq
       JOIN contacts c ON c.id = mq.contact_id
       WHERE mq.status = ?
       ORDER BY mq.created_at ASC`,
    )
    .all(status);
}

export function setContactPreferences(contactId, { messagePref, endOfDayOptin }) {
  const allowed = ['every_launch', 'weekly', 'monthly', 'launches_off', 'opt_out'];
  if (!allowed.includes(messagePref)) throw new Error(`Invalid message preference: ${messagePref}`);
  db.prepare(
    `UPDATE contacts SET message_pref = ?, end_of_day_optin = ?, message_pref_updated_at = datetime('now') WHERE id = ?`,
  ).run(messagePref, endOfDayOptin ? 1 : 0, contactId);
  return getContactById(contactId);
}

export function setMessagePref(contactId, pref) {
  const contact = getContactById(contactId);
  return setContactPreferences(contactId, {
    messagePref: pref,
    endOfDayOptin: contact?.end_of_day_optin ?? false,
  });
}

/** True if contact already has these prefs set within the last N seconds. */
export function messagePrefSetRecently(contactId, messagePref, endOfDayOptin, withinSeconds = 120) {
  const c = getContactById(contactId);
  if (!c || c.message_pref !== messagePref || !c.message_pref_updated_at) return false;
  if (!!c.end_of_day_optin !== !!endOfDayOptin) return false;
  const ms = new Date(String(c.message_pref_updated_at).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(ms)) return false;
  return (Date.now() - ms) / 1000 < withinSeconds;
}

export function recordLaunchSentAt(contactId) {
  db.prepare(`UPDATE contacts SET last_launch_sent_at = datetime('now') WHERE id = ?`).run(contactId);
}

export function hasPendingQueueMessage(contactId) {
  const row = db
    .prepare(
      `SELECT 1 FROM message_queue WHERE contact_id = ? AND status = 'pending' LIMIT 1`,
    )
    .get(contactId);
  return !!row;
}

/** Pending row written by MCP (skill-powered compose) — server drafter must not overwrite. */
export function isMcpComposedPending(contactId) {
  const row = db
    .prepare(
      `SELECT template_id AS templateId, template_name AS templateName
       FROM message_queue WHERE contact_id = ? AND status = 'pending' LIMIT 1`,
    )
    .get(contactId);
  if (!row) return false;
  const name = String(row.templateName || '');
  if (name === 'Composed by Claude' || name.includes('Composed by Claude')) return true;
  const tid = String(row.templateId || '');
  if (tid.startsWith('claude:') && !name.startsWith('Claude ·')) return true;
  return false;
}

export function queueCustomMessages({
  contactIds,
  body,
  items,
  minDaysBetween = 7,
  campaignType = null,
  respectPending = true,
  replacePending = false,
  respectMcpPending = false,
}) {
  const entries = items?.length
    ? items.map((i) => ({
        contactId: i.contactId,
        body: i.body?.trim(),
        templateId: i.templateId,
        templateName: i.templateName,
      }))
    : contactIds?.map((id) => ({ contactId: id, body: body?.trim() }));

  if (!entries?.length) throw new Error('contactIds or items required');
  if (entries.some((e) => !e.contactId || !e.body)) {
    throw new Error('Each item needs contactId and body');
  }

  const insert = db.prepare(
    `INSERT INTO message_queue (id, contact_id, message_body, template_id, template_name, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  );
  const removePending = db.prepare(
    `DELETE FROM message_queue WHERE contact_id = ? AND status = 'pending'`,
  );

  const txn = db.transaction((rows) => {
    const queued = [];
    const skipped = [];
    for (const row of rows) {
      const contact = getContactById(row.contactId);
      if (!contact) {
        skipped.push({ contactId: row.contactId, reason: 'not_found' });
        continue;
      }
      if (!isMessageDedupExemptPhone(contact.phone) && isContactRecentlyMessaged(row.contactId, minDaysBetween)) {
        skipped.push({ contactId: row.contactId, contactName: contact.name, reason: 'recent_message' });
        continue;
      }
      const filledBody = fillTemplate(row.body, contact.name);
      if (!isMessageDedupExemptPhone(contact.phone)) {
        const dup = contactAlreadyReceivedMessage(row.contactId, {
          body: filledBody,
          templateId: row.templateId,
        });
        if (dup.duplicate) {
          skipped.push({
            contactId: row.contactId,
            contactName: contact.name,
            reason: 'duplicate_message',
            detail: duplicateSkipReason(dup),
            sentAt: dup.sentAt,
          });
          continue;
        }
      }
      if (campaignType === 'launch') {
        if (!isEligibleForLaunchCampaign(contact, minDaysBetween)) {
          skipped.push({ contactId: row.contactId, contactName: contact.name, reason: 'message_pref' });
          continue;
        }
      }
      const pendingExists = hasPendingQueueMessage(row.contactId);
      if (!replacePending && respectPending && pendingExists) {
        skipped.push({
          contactId: row.contactId,
          contactName: contact.name,
          reason: 'pending_in_queue',
          detail: 'Pending message kept until sent',
        });
        continue;
      }
      if (!replacePending && respectMcpPending && isMcpComposedPending(row.contactId)) {
        skipped.push({
          contactId: row.contactId,
          contactName: contact.name,
          reason: 'mcp_pending',
          detail: 'MCP-composed message kept in queue',
        });
        continue;
      }
      if (replacePending || pendingExists) {
        removePending.run(row.contactId);
      }
      const id = `mq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      insert.run(id, row.contactId, row.body, row.templateId || null, row.templateName || null);
      queued.push({
        id,
        contactId: row.contactId,
        contactName: contact.name,
        messageBody: row.body,
      });
    }
    if (queued.length === 0) {
      const allRecent = skipped.every((s) => s.reason === 'recent_message');
      const allPref = skipped.every((s) => s.reason === 'message_pref');
      const allDup = skipped.every((s) => s.reason === 'duplicate_message');
      const allMcp = skipped.every((s) => s.reason === 'mcp_pending');
      const allPending = skipped.every((s) => s.reason === 'pending_in_queue');
      throw new Error(
        allRecent
          ? `All contacts were messaged within the last ${minDaysBetween} days`
          : allPref
            ? 'No contacts eligible for launch (opt-out, unset, or frequency cap)'
            : allDup
              ? 'All contacts already received this message (duplicate blocked)'
              : allMcp
                ? 'All contacts have MCP-composed messages in queue (not overwritten)'
                : allPending
                  ? 'All contacts already have pending messages in queue (not overwritten until sent)'
                  : 'No valid contact IDs found',
      );
    }
    return { queued, skipped };
  });

  return txn(entries);
}

export function isContactRecentlyMessaged(contactId, minDays = 7) {
  const row = db
    .prepare(`SELECT MAX(sent_at) AS sent_at FROM message_log WHERE contact_id = ?`)
    .get(contactId);
  if (!row?.sent_at) return false;
  const sentMs = new Date(row.sent_at.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(sentMs)) return false;
  const days = (Date.now() - sentMs) / 86400000;
  return days < minDays;
}

export function hasSentTemplateId(contactId, templateId) {
  const row = db
    .prepare(
      `SELECT 1 FROM message_log WHERE contact_id = ? AND template_id = ? LIMIT 1`,
    )
    .get(contactId, templateId);
  return !!row;
}

export function getPendingQueueBody(contactId) {
  return db
    .prepare(
      `SELECT message_body FROM message_queue WHERE contact_id = ? AND status = 'pending' LIMIT 1`,
    )
    .get(contactId)?.message_body;
}

export function getContactSentLogSummary(contactId, limit = 40) {
  return db
    .prepare(
      `SELECT template_id, template_name, message_body, sent_at
       FROM message_log WHERE contact_id = ? ORDER BY sent_at DESC LIMIT ?`,
    )
    .all(contactId, limit);
}

export function clearMessageQueue(contactIds) {
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    throw new Error(
      'contactIds required — pending queue rows are only removed per customer after send',
    );
  }
  const placeholders = contactIds.map(() => '?').join(',');
  const result = db
    .prepare(
      `DELETE FROM message_queue WHERE status = 'pending' AND contact_id IN (${placeholders})`,
    )
    .run(...contactIds);
  return result.changes;
}

function normalizeWholesaleLeadRow(row) {
  if (!row) return null;
  return {
    ...row,
    priority: row.priority != null ? Number(row.priority) : null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
  };
}

export function getWholesaleLeadById(id) {
  const row = db
    .prepare(
      `SELECT wl.*,
              (SELECT MAX(sent_at) FROM wholesale_outreach wo
               WHERE wo.lead_id = wl.id AND wo.status = 'sent') AS lastSentAt
       FROM wholesale_leads wl WHERE wl.id = ?`,
    )
    .get(id);
  return normalizeWholesaleLeadRow(row);
}

export function listWholesaleLeads({ zone, status } = {}) {
  let sql = `SELECT wl.*,
                    (SELECT MAX(sent_at) FROM wholesale_outreach wo
                     WHERE wo.lead_id = wl.id AND wo.status = 'sent') AS lastSentAt
             FROM wholesale_leads wl WHERE 1=1`;
  const params = [];
  if (zone) {
    sql += ' AND wl.zone = ?';
    params.push(zone);
  }
  if (status) {
    sql += ' AND wl.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY COALESCE(wl.priority, 999) ASC, wl.name ASC';
  return db.prepare(sql).all(...params).map(normalizeWholesaleLeadRow);
}

export function saveWholesaleLead(fields) {
  const {
    id,
    name,
    type = null,
    zone = null,
    address = null,
    phone = null,
    email = null,
    instagram = null,
    website = null,
    lat = null,
    lng = null,
    fit_note = null,
    priority = null,
    status = 'new',
  } = fields || {};

  if (!name?.trim()) throw new Error('name required');

  const leadId =
    id?.trim() ||
    `wh-${name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString(36).slice(-4)}`;

  const existing = getWholesaleLeadById(leadId);
  if (existing) {
    db.prepare(
      `UPDATE wholesale_leads SET
         name = ?, type = ?, zone = ?, address = ?, phone = ?, email = ?,
         instagram = ?, website = ?, lat = ?, lng = ?, fit_note = ?, priority = ?,
         status = COALESCE(?, status)
       WHERE id = ?`,
    ).run(
      name.trim(),
      type,
      zone,
      address,
      phone,
      email,
      instagram,
      website,
      lat,
      lng,
      fit_note,
      priority,
      status || null,
      leadId,
    );
  } else {
    db.prepare(
      `INSERT INTO wholesale_leads (
         id, name, type, zone, address, phone, email, instagram, website,
         lat, lng, fit_note, priority, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      leadId,
      name.trim(),
      type,
      zone,
      address,
      phone,
      email,
      instagram,
      website,
      lat,
      lng,
      fit_note,
      priority,
      status || 'new',
    );
  }
  return getWholesaleLeadById(leadId);
}

export function updateWholesaleLeadStatus(leadId, status) {
  const allowed = ['new', 'contacted', 'replied', 'sampling', 'won', 'declined'];
  if (!allowed.includes(status)) throw new Error(`Invalid status: ${status}`);
  const lead = getWholesaleLeadById(leadId);
  if (!lead) throw new Error('Lead not found');
  db.prepare(`UPDATE wholesale_leads SET status = ? WHERE id = ?`).run(status, leadId);
  return getWholesaleLeadById(leadId);
}

export function getWholesaleOutreachSent(leadId) {
  return db
    .prepare(
      `SELECT body, sent_at FROM wholesale_outreach
       WHERE lead_id = ? AND status = 'sent' AND direction = 'out'
       ORDER BY sent_at ASC`,
    )
    .all(leadId);
}

export function getWholesalePendingBody(leadId) {
  return db
    .prepare(
      `SELECT body FROM wholesale_outreach
       WHERE lead_id = ? AND status = 'pending' LIMIT 1`,
    )
    .get(leadId)?.body;
}

export function hasPendingWholesaleMessage(leadId) {
  const row = db
    .prepare(`SELECT 1 FROM wholesale_outreach WHERE lead_id = ? AND status = 'pending' LIMIT 1`)
    .get(leadId);
  return !!row;
}

export function listWholesaleQueue(status = 'pending') {
  return db
    .prepare(
      `SELECT wo.id, wo.lead_id AS leadId, wo.body AS messageBody, wo.status,
              wo.created_at AS createdAt, wl.name AS leadName, wl.phone,
              wl.zone, wl.status AS leadStatus, wl.type, wl.fit_note AS fitNote
       FROM wholesale_outreach wo
       JOIN wholesale_leads wl ON wl.id = wo.lead_id
       WHERE wo.status = ?
       ORDER BY wo.created_at ASC`,
    )
    .all(status);
}

export function queueWholesaleOutreachRows(rows, replacePending = false) {
  const insert = db.prepare(
    `INSERT INTO wholesale_outreach (id, lead_id, channel, direction, body, status)
     VALUES (?, ?, 'whatsapp', 'out', ?, 'pending')`,
  );
  const removePending = db.prepare(
    `DELETE FROM wholesale_outreach WHERE lead_id = ? AND status = 'pending'`,
  );
  const queued = [];
  for (const row of rows) {
    const lead = getWholesaleLeadById(row.leadId);
    if (!lead) continue;
    if (replacePending) removePending.run(row.leadId);
    else if (hasPendingWholesaleMessage(row.leadId)) removePending.run(row.leadId);
    const id = `wo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    insert.run(id, row.leadId, row.body);
    queued.push({ id, leadId: row.leadId, leadName: lead.name, messageBody: row.body });
  }
  return queued;
}

export function markWholesaleOutreachSent({ leadId, body, outreachId }) {
  const now = db.prepare(`SELECT datetime('now') AS now`).get().now;
  if (outreachId) {
    db.prepare(
      `UPDATE wholesale_outreach SET status = 'sent', sent_at = ?, direction = 'out', body = ?
       WHERE id = ? AND lead_id = ?`,
    ).run(now, body, outreachId, leadId);
  } else {
    const pending = db
      .prepare(
        `SELECT id FROM wholesale_outreach WHERE lead_id = ? AND status = 'pending' LIMIT 1`,
      )
      .get(leadId);
    if (pending) {
      db.prepare(
        `UPDATE wholesale_outreach SET status = 'sent', sent_at = ?, direction = 'out', body = ? WHERE id = ?`,
      ).run(now, body, pending.id);
    } else {
      const id = `wo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      db.prepare(
        `INSERT INTO wholesale_outreach (id, lead_id, channel, direction, body, status, sent_at)
         VALUES (?, ?, 'whatsapp', 'out', ?, 'sent', ?)`,
      ).run(id, leadId, body, now);
    }
  }
  db.prepare(`UPDATE wholesale_leads SET last_contacted_at = ? WHERE id = ?`).run(now, leadId);
  db.prepare(
    `UPDATE wholesale_leads SET status = 'contacted'
     WHERE id = ? AND status NOT IN ('won', 'declined')`,
  ).run(leadId);
}

export function clearWholesaleQueue(leadIds) {
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new Error('leadIds required — pending queue rows are only removed per lead after send');
  }
  const placeholders = leadIds.map(() => '?').join(',');
  const result = db
    .prepare(
      `DELETE FROM wholesale_outreach WHERE status = 'pending' AND lead_id IN (${placeholders})`,
    )
    .run(...leadIds);
  return result.changes;
}

export function findWholesaleLeadByPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw || raw.includes('IG DM') || raw === '(IG)') return null;
  const normalized = normalizePhone(raw);
  const row = db
    .prepare(
      `SELECT * FROM wholesale_leads
       WHERE phone = ? OR phone = ?
          OR replace(replace(replace(phone, ' ', ''), '+', ''), '-', '')
             = replace(replace(?, '+', ''), '-', '')`,
    )
    .get(normalized, raw, normalized);
  return normalizeWholesaleLeadRow(row);
}

export function recordWholesaleInbound({ leadId, body }) {
  const text = String(body || '').trim();
  if (!leadId || !text) throw new Error('leadId and body required');
  const lead = getWholesaleLeadById(leadId);
  if (!lead) throw new Error('Lead not found');

  const id = `wo-in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO wholesale_outreach (id, lead_id, channel, direction, body, status)
     VALUES (?, ?, 'whatsapp', 'in', ?, 'received')`,
  ).run(id, leadId, text);

  db.prepare(
    `UPDATE wholesale_leads SET status = 'replied'
     WHERE id = ? AND status NOT IN ('won', 'declined')`,
  ).run(leadId);

  return {
    id,
    leadId,
    leadName: lead.name,
    body: text,
    direction: 'in',
    status: 'received',
    createdAt: db.prepare(`SELECT datetime('now') AS now`).get().now,
  };
}

export function listWholesaleInbox({ since, unreadOnly } = {}) {
  let sql = `
    SELECT wo.id, wo.lead_id AS leadId, wo.body, wo.direction, wo.status,
           wo.created_at AS createdAt, wo.read_at AS readAt,
           wl.name AS leadName, wl.phone AS leadPhone, wl.zone, wl.type AS leadType,
           wl.status AS leadStatus, wl.fit_note AS fitNote
    FROM wholesale_outreach wo
    JOIN wholesale_leads wl ON wl.id = wo.lead_id
    WHERE wo.direction = 'in'
  `;
  const params = [];
  if (since) {
    sql += ' AND wo.created_at >= ?';
    params.push(since);
  }
  if (unreadOnly) {
    sql += ' AND wo.read_at IS NULL';
  }
  sql += ' ORDER BY wo.created_at DESC';
  return db.prepare(sql).all(...params);
}

export function markWholesaleInboxRead(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    throw new Error('messageIds required');
  }
  const placeholders = messageIds.map(() => '?').join(',');
  const result = db
    .prepare(
      `UPDATE wholesale_outreach SET read_at = datetime('now')
       WHERE direction = 'in' AND id IN (${placeholders})`,
    )
    .run(...messageIds);
  return result.changes;
}

// ─── WhatsApp Orders ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS wa_products (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL,
    photo_url TEXT,
    catalog_link TEXT,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wa_orders (
    id TEXT PRIMARY KEY,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    status TEXT DEFAULT 'new',
    items TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    delivery_fee REAL DEFAULT 0,
    total REAL DEFAULT 0,
    delivery_type TEXT,
    scheduled_for TEXT,
    address_text TEXT,
    postal_code TEXT,
    lat REAL,
    lng REAL,
    in_grab_zone INTEGER DEFAULT 0,
    payment_provider TEXT,
    payment_ref TEXT,
    payment_link TEXT,
    payment_status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wa_conversations (
    customer_phone TEXT PRIMARY KEY,
    order_id TEXT,
    current_state TEXT DEFAULT 'idle',
    context TEXT DEFAULT '{}',
    last_message_at TEXT,
    last_nudge_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES wa_orders(id)
  );

  CREATE TABLE IF NOT EXISTS wa_order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    customer_phone TEXT,
    from_state TEXT,
    to_state TEXT,
    event TEXT,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_wa_orders_status ON wa_orders(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_wa_orders_phone ON wa_orders(customer_phone);
  CREATE INDEX IF NOT EXISTS idx_wa_order_events_order ON wa_order_events(order_id);

  CREATE TABLE IF NOT EXISTS wa_drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wa_driver_dispatches (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    accepted_driver_phone TEXT,
    eta_minutes INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    assigned_at TEXT,
    FOREIGN KEY (order_id) REFERENCES wa_orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wa_driver_dispatches_order ON wa_driver_dispatches(order_id, status);
  CREATE INDEX IF NOT EXISTS idx_wa_drivers_active ON wa_drivers(active);

  CREATE TABLE IF NOT EXISTS wa_delivery_tracking (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    customer_token TEXT NOT NULL UNIQUE,
    driver_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    driver_lat REAL,
    driver_lng REAL,
    driver_updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    FOREIGN KEY (order_id) REFERENCES wa_orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wa_delivery_tracking_customer ON wa_delivery_tracking(customer_token);
  CREATE INDEX IF NOT EXISTS idx_wa_delivery_tracking_driver ON wa_delivery_tracking(driver_token);
`);

try {
  db.exec(`ALTER TABLE wa_driver_dispatches ADD COLUMN picked_up_at TEXT`);
} catch {
  /* exists */
}
try {
  db.exec(`ALTER TABLE wa_driver_dispatches ADD COLUMN delivered_at TEXT`);
} catch {
  /* exists */
}
try {
  db.exec(`ALTER TABLE wa_orders ADD COLUMN order_number INTEGER`);
} catch {
  /* exists */
}

function backfillWaOrderNumbers() {
  const missing = db.prepare('SELECT id FROM wa_orders WHERE order_number IS NULL ORDER BY created_at ASC').all();
  if (!missing.length) return;
  const maxRow = db.prepare('SELECT COALESCE(MAX(order_number), 0) AS n FROM wa_orders').get();
  let next = maxRow?.n || 0;
  const upd = db.prepare('UPDATE wa_orders SET order_number = ? WHERE id = ?');
  for (const row of missing) {
    next += 1;
    upd.run(next, row.id);
  }
}
backfillWaOrderNumbers();

function nextWaOrderNumber() {
  const row = db.prepare('SELECT COALESCE(MAX(order_number), 0) + 1 AS n FROM wa_orders').get();
  return row?.n || 1;
}

function parseWaJson(raw, fallback = {}) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeWaOrderRow(row) {
  if (!row) return null;
  const order = {
    ...row,
    items: parseWaJson(row.items, []),
    in_grab_zone: !!row.in_grab_zone,
  };
  const fixed = deflateInflatedWaOrderPrices(order);
  if (fixed.subtotal !== order.subtotal || fixed.total !== order.total) {
    db.prepare('UPDATE wa_orders SET items = ?, subtotal = ?, total = ? WHERE id = ?').run(
      JSON.stringify(fixed.items),
      fixed.subtotal,
      fixed.total,
      order.id,
    );
    return fixed;
  }
  return order;
}

function normalizeWaConversationRow(row) {
  if (!row) return null;
  return {
    ...row,
    context: parseWaJson(row.context, {}),
  };
}

function seedWaProducts() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM wa_products').get();
  if (n > 0) return;
  const products = [
    ['classic', 'Classic Tiramisù', 'Handmade Sicilian classic', 15, 1],
    ['pistachio', 'Pistachio Tiramisù', 'Bronte pistachio', 16, 2],
    ['orange', 'Orange Liqueur Tiramisù', 'Sicilian orange liqueur', 16, 3],
    ['tray', 'Sharing Tray (4–6 pax)', 'For gatherings', 50, 4],
    ['birthday', 'Birthday Set', 'Tray + candle + message', 80, 5],
  ];
  const catalog = process.env.WA_CATALOG_LINK || 'https://wa.me/c/6591329303';
  const ins = db.prepare(
    `INSERT INTO wa_products (sku, name, description, price, catalog_link, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const [sku, name, desc, price, sort] of products) {
    ins.run(sku, name, desc, price, catalog, sort);
  }
}
seedWaProducts();

export function listWaProducts({ activeOnly = true } = {}) {
  let sql = 'SELECT * FROM wa_products';
  if (activeOnly) sql += ' WHERE active = 1';
  sql += ' ORDER BY sort_order ASC, name ASC';
  return db.prepare(sql).all();
}

export function getWaProduct(sku) {
  return db.prepare('SELECT * FROM wa_products WHERE sku = ?').get(sku);
}

export function logWaOrderEvent({ orderId, phone, fromState, toState, event, detail }) {
  db.prepare(
    `INSERT INTO wa_order_events (id, order_id, customer_phone, from_state, to_state, event, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uniqueId(),
    orderId || null,
    phone || null,
    fromState || null,
    toState || null,
    event || 'transition',
    detail ? String(detail).slice(0, 500) : null,
  );
}

export function getWaConversation(phone) {
  const row = db
    .prepare('SELECT * FROM wa_conversations WHERE customer_phone = ?')
    .get(phone);
  return normalizeWaConversationRow(row);
}

export function upsertWaConversation({ phone, orderId, state, context }) {
  const now = new Date().toISOString();
  const existing = getWaConversation(phone);
  const ctxJson = JSON.stringify(context || {});
  if (existing) {
    db.prepare(
      `UPDATE wa_conversations SET order_id = ?, current_state = ?, context = ?,
       last_message_at = ?, updated_at = ? WHERE customer_phone = ?`,
    ).run(orderId ?? existing.order_id, state, ctxJson, now, now, phone);
  } else {
    db.prepare(
      `INSERT INTO wa_conversations (customer_phone, order_id, current_state, context, last_message_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(phone, orderId || null, state, ctxJson, now);
  }
  return getWaConversation(phone);
}

export function clearWaConversation(phone) {
  db.prepare('DELETE FROM wa_conversations WHERE customer_phone = ?').run(phone);
}

export function createWaOrder({ phone, name, status = 'awaiting_item' }) {
  const id = uniqueId();
  const orderNumber = nextWaOrderNumber();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO wa_orders (id, customer_phone, customer_name, status, order_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, phone, name || null, status, orderNumber, now, now);
  logWaOrderEvent({
    orderId: id,
    phone,
    fromState: null,
    toState: status,
    event: 'order_created',
  });
  return getWaOrder(id);
}

export function getWaOrder(id) {
  return normalizeWaOrderRow(db.prepare('SELECT * FROM wa_orders WHERE id = ?').get(id));
}

export function getWaOrderByNumber(orderNumber) {
  const n = parseInt(String(orderNumber), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return normalizeWaOrderRow(
    db.prepare('SELECT * FROM wa_orders WHERE order_number = ?').get(n),
  );
}

export function getActiveWaOrderForPhone(phone) {
  const row = db.prepare(
    `SELECT * FROM wa_orders WHERE customer_phone = ?
     AND status NOT IN ('completed', 'cancelled')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(phone);
  return normalizeWaOrderRow(row);
}

export function updateWaOrder(id, patch) {
  const allowed = [
    'customer_name', 'status', 'items', 'subtotal', 'delivery_fee', 'total',
    'delivery_type', 'scheduled_for', 'address_text', 'postal_code', 'lat', 'lng',
    'in_grab_zone', 'payment_provider', 'payment_ref', 'payment_link', 'payment_status', 'notes',
  ];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    if (key === 'items') vals.push(JSON.stringify(patch[key]));
    else if (key === 'in_grab_zone') vals.push(patch[key] ? 1 : 0);
    else vals.push(patch[key]);
  }
  if (!sets.length) return getWaOrder(id);
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE wa_orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getWaOrder(id);
}

export function transitionWaOrder(id, { fromState, toState, patch = {}, event, detail }) {
  const order = getWaOrder(id);
  if (!order) throw new Error('Order not found');
  const next = updateWaOrder(id, { ...patch, status: toState });
  logWaOrderEvent({
    orderId: id,
    phone: order.customer_phone,
    fromState: fromState || order.status,
    toState,
    event: event || 'transition',
    detail,
  });
  return next;
}

export function listWaOrders({ status, limit = 200 } = {}) {
  let sql = 'SELECT * FROM wa_orders WHERE 1=1';
  const params = [];
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params).map(normalizeWaOrderRow).map((order) => ({
    ...order,
    dispatch: getLatestWaDriverDispatch(order.id) || null,
  }));
}

export function getWaOrderEvents(orderId) {
  return db.prepare(
    'SELECT * FROM wa_order_events WHERE order_id = ? ORDER BY created_at ASC',
  ).all(orderId);
}

export function getWaOrderMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS ordersToday,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS revenueToday,
      COALESCE(SUM(CASE WHEN in_grab_zone = 1 THEN 1 ELSE 0 END), 0) AS inZone,
      COALESCE(SUM(CASE WHEN in_grab_zone = 0 AND address_text IS NOT NULL THEN 1 ELSE 0 END), 0) AS outZone,
      COALESCE(AVG(CASE WHEN payment_status = 'paid' THEN total END), 0) AS avgOrderValue
    FROM wa_orders
    WHERE date(created_at) = date(?)
  `).get(today);
  return row;
}

export function listWaOrderMessages(phone) {
  const contact = findContactByPhone(phone);
  if (contact) {
    return getWhatsAppInteractions(contact.id).slice(0, 50).reverse();
  }
  const digits = String(phone || '').replace(/\D/g, '');
  return db.prepare(`
    SELECT direction, body, message_type AS messageType, created_at AS createdAt
    FROM whatsapp_interactions
    WHERE replace(replace(phone, ' ', ''), '+', '') = ?
    ORDER BY created_at DESC LIMIT 50
  `).all(digits).reverse();
}

export function getLastDeliveryAddressForPhone(phone, { excludeOrderId } = {}) {
  let sql = `
    SELECT address_text, postal_code, lat, lng, in_grab_zone, delivery_fee
    FROM wa_orders
    WHERE customer_phone = ?
      AND address_text IS NOT NULL AND trim(address_text) != ''
      AND status IN ('completed', 'paid', 'out_for_delivery', 'scheduled')
  `;
  const params = [phone];
  if (excludeOrderId) {
    sql += ' AND id != ?';
    params.push(excludeOrderId);
  }
  sql += ' ORDER BY CASE WHEN status = \'completed\' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1';
  const row = db.prepare(sql).get(...params);
  if (!row) return null;
  return {
    address_text: row.address_text,
    postal_code: row.postal_code,
    lat: row.lat,
    lng: row.lng,
    in_grab_zone: !!row.in_grab_zone,
    delivery_fee: row.delivery_fee,
  };
}

export function listWaDrivers({ activeOnly = false } = {}) {
  let sql = 'SELECT * FROM wa_drivers';
  if (activeOnly) sql += ' WHERE active = 1';
  sql += ' ORDER BY name ASC';
  return db.prepare(sql).all().map((r) => ({ ...r, active: !!r.active }));
}

export function getWaDriver(id) {
  const row = db.prepare('SELECT * FROM wa_drivers WHERE id = ?').get(id);
  return row ? { ...row, active: !!row.active } : null;
}

export function getWaDriverByPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const row = db.prepare(`
    SELECT * FROM wa_drivers
    WHERE replace(replace(phone, ' ', ''), '+', '') = ? AND active = 1
  `).get(digits);
  return row ? { ...row, active: !!row.active } : null;
}

export function createWaDriver({ name, phone, notes }) {
  const id = uniqueId();
  const normalized = String(phone).trim().replace(/\s/g, '');
  const phoneVal = normalized.startsWith('+') ? normalized : `+${normalized.replace(/\D/g, '')}`;
  db.prepare(
    `INSERT INTO wa_drivers (id, name, phone, notes) VALUES (?, ?, ?, ?)`,
  ).run(id, String(name).trim(), phoneVal, notes || null);
  return getWaDriver(id);
}

export function updateWaDriver(id, patch) {
  const allowed = ['name', 'phone', 'active', 'notes'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    vals.push(key === 'active' ? (patch[key] ? 1 : 0) : patch[key]);
  }
  if (!sets.length) return getWaDriver(id);
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE wa_drivers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getWaDriver(id);
}

export function deleteWaDriver(id) {
  db.prepare('DELETE FROM wa_drivers WHERE id = ?').run(id);
}

export function getOpenWaDriverDispatch(orderId) {
  return db.prepare(
    `SELECT * FROM wa_driver_dispatches WHERE order_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
  ).get(orderId);
}

export function getLatestWaDriverDispatch(orderId) {
  return db.prepare(
    `SELECT * FROM wa_driver_dispatches WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(orderId);
}

export function createWaDriverDispatch(orderId) {
  db.prepare(
    `UPDATE wa_driver_dispatches SET status = 'cancelled' WHERE order_id = ? AND status = 'open'`,
  ).run(orderId);
  const id = uniqueId();
  db.prepare(
    `INSERT INTO wa_driver_dispatches (id, order_id, status) VALUES (?, ?, 'open')`,
  ).run(id, orderId);
  return db.prepare('SELECT * FROM wa_driver_dispatches WHERE id = ?').get(id);
}

export function getAnyOpenWaDriverDispatch(orderTag) {
  if (orderTag) {
    return findWaDriverDispatchByOrderTag(orderTag, { status: 'open' });
  }
  return db.prepare(
    `SELECT * FROM wa_driver_dispatches WHERE status = 'open' ORDER BY created_at DESC LIMIT 1`,
  ).get();
}

export function findWaDriverDispatchByOrderTag(orderTag, { status, driverPhone } = {}) {
  const tag = String(orderTag || '').toLowerCase().replace(/^#/, '');

  if (/^\d+$/.test(tag)) {
    const order = getWaOrderByNumber(parseInt(tag, 10));
    if (order) {
      return findWaDriverDispatchForOrderId(order.id, { status, driverPhone });
    }
  }

  let sql = `SELECT * FROM wa_driver_dispatches WHERE order_id LIKE ?`;
  const params = [`%-${tag}`];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (driverPhone) {
    sql += ` AND replace(replace(accepted_driver_phone, ' ', ''), '+', '') = ?`;
    params.push(String(driverPhone).replace(/\D/g, ''));
  }
  sql += ' ORDER BY created_at DESC LIMIT 1';
  return db.prepare(sql).get(...params);
}

function findWaDriverDispatchForOrderId(orderId, { status, driverPhone } = {}) {
  let sql = `SELECT * FROM wa_driver_dispatches WHERE order_id = ?`;
  const params = [orderId];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (driverPhone) {
    sql += ` AND replace(replace(accepted_driver_phone, ' ', ''), '+', '') = ?`;
    params.push(String(driverPhone).replace(/\D/g, ''));
  }
  sql += ' ORDER BY created_at DESC LIMIT 1';
  return db.prepare(sql).get(...params);
}

export function getDriverActiveDispatches(driverPhone) {
  const digits = String(driverPhone || '').replace(/\D/g, '');
  return db.prepare(`
    SELECT * FROM wa_driver_dispatches
    WHERE replace(replace(accepted_driver_phone, ' ', ''), '+', '') = ?
      AND status IN ('assigned', 'picked_up')
    ORDER BY assigned_at ASC
  `).all(digits);
}

export function tryAssignWaDriverDispatch({ dispatchId, driverPhone, etaMinutes }) {
  const result = db.prepare(`
    UPDATE wa_driver_dispatches
    SET status = 'assigned', accepted_driver_phone = ?, eta_minutes = ?, assigned_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `).run(driverPhone, etaMinutes, dispatchId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM wa_driver_dispatches WHERE id = ?').get(dispatchId);
}

export function markWaDriverDispatchPickedUp(dispatchId) {
  const result = db.prepare(`
    UPDATE wa_driver_dispatches
    SET status = 'picked_up', picked_up_at = datetime('now')
    WHERE id = ? AND status = 'assigned'
  `).run(dispatchId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM wa_driver_dispatches WHERE id = ?').get(dispatchId);
}

export function markWaDriverDispatchDelivered(dispatchId) {
  const result = db.prepare(`
    UPDATE wa_driver_dispatches
    SET status = 'delivered', delivered_at = datetime('now')
    WHERE id = ? AND status = 'picked_up'
  `).run(dispatchId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM wa_driver_dispatches WHERE id = ?').get(dispatchId);
}

function normalizeWaDeliveryTrackingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    customerToken: row.customer_token,
    driverToken: row.driver_token,
    status: row.status,
    driverLat: row.driver_lat,
    driverLng: row.driver_lng,
    driverUpdatedAt: row.driver_updated_at,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

export function getWaDeliveryTrackingByOrderId(orderId) {
  const row = db.prepare('SELECT * FROM wa_delivery_tracking WHERE order_id = ?').get(orderId);
  return normalizeWaDeliveryTrackingRow(row);
}

export function getWaDeliveryTrackingByCustomerToken(token) {
  const row = db.prepare('SELECT * FROM wa_delivery_tracking WHERE customer_token = ?').get(token);
  return normalizeWaDeliveryTrackingRow(row);
}

export function getWaDeliveryTrackingByDriverToken(token) {
  const row = db.prepare('SELECT * FROM wa_delivery_tracking WHERE driver_token = ?').get(token);
  return normalizeWaDeliveryTrackingRow(row);
}

export function createWaDeliveryTracking({ orderId, customerToken, driverToken }) {
  const id = uniqueId();
  db.prepare(`
    INSERT INTO wa_delivery_tracking (id, order_id, customer_token, driver_token, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(id, orderId, customerToken, driverToken);
  return getWaDeliveryTrackingByOrderId(orderId);
}

export function updateWaDeliveryTrackingLocation(driverToken, lat, lng) {
  const result = db.prepare(`
    UPDATE wa_delivery_tracking
    SET driver_lat = ?, driver_lng = ?, driver_updated_at = datetime('now')
    WHERE driver_token = ? AND status = 'active'
  `).run(lat, lng, driverToken);
  if (result.changes === 0) return null;
  return getWaDeliveryTrackingByDriverToken(driverToken);
}

export function endWaDeliveryTracking(orderId) {
  const result = db.prepare(`
    UPDATE wa_delivery_tracking
    SET status = 'ended', ended_at = datetime('now')
    WHERE order_id = ? AND status = 'active'
  `).run(orderId);
  if (result.changes === 0) return null;
  return getWaDeliveryTrackingByOrderId(orderId);
}

