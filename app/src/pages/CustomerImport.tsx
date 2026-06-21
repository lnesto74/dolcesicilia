import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import { Upload, Users, Download, Save, Trash2, Loader2, ImageIcon, CheckCircle2, AlertCircle, Contact } from 'lucide-react';
import Tesseract from 'tesseract.js';
import {
  type ExtractedContact,
  parseContactsFromOcrText,
  toVCard,
  toSingleVCard,
  getSelectedContacts,
  isContactSelected,
} from '@shared/parseContacts';
import { extractOrderTimestamp } from '@shared/orderTimestamp';
import { extractOrderValue, formatSgd, isHighValueOrder } from '@shared/parseOrderValue';
import { extractImageCaptureMs } from '../lib/extractImageTimestamp';
import {
  computeOnboardingOptInView,
  hasWelcomeMessageSent,
  welcomeSentAtFromMessages,
  type OnboardingOptInView,
} from '@shared/onboardingStatus';

const API_URL = import.meta.env.VITE_API_URL || '';

const isIOS =
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/i.test(navigator.userAgent);

function openVCardOnDevice(vcfContent: string): void {
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function buildVCardFile(contacts: ExtractedContact[]): File {
  const vcfContent = toVCard(contacts);
  const filename = `dolcesicilia-customers-${contacts.length}.vcf`;
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
  return new File([blob], filename, { type: 'text/vcard' });
}

interface EnrichedContact extends ExtractedContact {
  existing?: boolean;
  customer_type?: 'first_time' | 'returning';
  existingName?: string;
  order_count?: number;
  orderedAt?: string;
  orderTimeLabel?: string;
  timestampSource?: string;
  screenshotAt?: string;
  orderValue?: number | null;
  orderValueLabel?: string | null;
  valueSource?: string | null;
  currency?: string;
  isNewCustomerGrab?: boolean;
  screenshotId?: string;
}

interface ProcessedImage {
  id: string;
  filename: string;
  previewUrl: string;
  contacts: EnrichedContact[];
  status: 'found' | 'none' | 'error';
  orderTimeLabel?: string;
  timestampSource?: string;
  orderValue?: number | null;
  orderValueLabel?: string | null;
  screenshotId?: string;
}

interface SavedContact extends ExtractedContact {
  displayTags?: string[];
  followup_status?: string | null;
  message_pref?: string | null;
  message_pref_updated_at?: string | null;
  end_of_day_optin?: boolean;
  welcomeSent?: boolean;
  welcomeSentAt?: string | null;
  onboardingScheduleStatus?: string | null;
  optInView?: OnboardingOptInView;
  sentMessages?: { template_id: string; sent_at?: string }[];
  customer_type?: string;
  order_count?: number;
  orderStats?: { count: number; firstOrderAt: string; lastOrderAt: string } | null;
}

type OptInFilter = 'all' | 'awaiting' | 'queued' | 'opted_in' | 'opted_out' | 'not_sent';

function resolveOptInView(c: SavedContact): OnboardingOptInView {
  if (c.optInView) return c.optInView;
  const welcomeSent =
    !!c.welcomeSent ||
    c.onboardingScheduleStatus === 'sent' ||
    hasWelcomeMessageSent(c.sentMessages);
  return computeOnboardingOptInView({
    message_pref: c.message_pref,
    message_pref_updated_at: c.message_pref_updated_at,
    end_of_day_optin: c.end_of_day_optin,
    welcomeSent,
    welcomeSentAt: c.welcomeSentAt || welcomeSentAtFromMessages(c.sentMessages),
    onboardingScheduleStatus: c.onboardingScheduleStatus,
    sentMessages: c.sentMessages,
  });
}

function matchesOptInFilter(view: OnboardingOptInView, filter: OptInFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'awaiting') return view.welcomeStatus === 'sent_awaiting';
  if (filter === 'queued') return view.welcomeStatus === 'queued';
  if (filter === 'not_sent') return view.welcomeStatus === 'not_sent';
  if (filter === 'opted_out') return view.pref === 'opt_out';
  if (filter === 'opted_in') return view.pref !== 'unset' && view.pref !== 'opt_out';
  return true;
}

function formatOrderTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatOrderTimeShort(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function StatusTag({
  label,
  className,
  title,
}: {
  label: string;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title || label}
      className={`inline-flex items-center text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded whitespace-nowrap leading-none ${className}`}
    >
      {label}
    </span>
  );
}

async function ocrImageClient(file: File): Promise<{ text: string; contacts: ExtractedContact[] }> {
  const { data } = await Tesseract.recognize(file, 'eng', { logger: () => {} });
  const contacts = parseContactsFromOcrText(data.text).map((c) => ({
    ...c,
    sourceImage: file.name,
  }));
  return { text: data.text, contacts };
}

/** iOS Safari invalidates FileList entries after async gaps — snapshot file data first. */
async function snapshotFile(file: File, index: number): Promise<File> {
  const buffer = await file.arrayBuffer();
  const name = file.name || `screenshot-${index + 1}.jpg`;
  const type = file.type || 'image/jpeg';
  return new File([buffer], name, { type, lastModified: file.lastModified });
}

async function processOneImage(file: File, index: number): Promise<ProcessedImage> {
  const previewUrl = URL.createObjectURL(file);
  const id = `batch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`;

  const captureMs = await extractImageCaptureMs(file);

  const enrichWithOrderMeta = (text: string, contacts: ExtractedContact[]): EnrichedContact[] => {
    const orderTs = extractOrderTimestamp(text, captureMs);
    const orderVal = extractOrderValue(text);
    return contacts.map((c) => ({
      ...c,
      sourceImage: file.name,
      orderedAt: orderTs?.orderedAt,
      orderTimeLabel: orderTs?.label,
      timestampSource: orderTs?.source,
      screenshotAt: captureMs ? new Date(captureMs).toISOString() : undefined,
      orderValue: orderVal?.orderValue ?? null,
      orderValueLabel: orderVal?.raw ?? null,
      valueSource: orderVal?.source ?? null,
      currency: orderVal?.currency ?? 'SGD',
      isNewCustomerGrab: orderVal?.isNewCustomer ?? false,
    }));
  };

  try {
    const formData = new FormData();
    formData.append('images', file);
    if (captureMs) {
      formData.append('imageCaptureTimes', JSON.stringify([new Date(captureMs).toISOString()]));
    }
    const apiRes = await fetch(`${API_URL}/api/ocr`, { method: 'POST', body: formData });

    let contacts: EnrichedContact[] = [];
    let orderTimeLabel: string | undefined;
    let timestampSource: string | undefined;
    let orderValue: number | null | undefined;
    let orderValueLabel: string | undefined;
    if (apiRes.ok) {
      const data = await apiRes.json();
      const batch = (data.results || [])[0];
      orderTimeLabel = batch?.orderTimestamp?.label;
      timestampSource = batch?.orderTimestamp?.source;
      orderValue = batch?.orderValue?.orderValue ?? batch?.contacts?.[0]?.orderValue;
      orderValueLabel = batch?.orderValue?.raw ?? batch?.contacts?.[0]?.orderValueLabel;
      contacts = (batch?.contacts || data.contacts || []).map((c: EnrichedContact) => ({
        ...c,
        sourceImage: file.name,
        screenshotId: c.screenshotId || batch?.screenshotId,
      }));
    } else {
      const result = await ocrImageClient(file);
      contacts = enrichWithOrderMeta(result.text, result.contacts);
      orderTimeLabel = contacts[0]?.orderTimeLabel;
      timestampSource = contacts[0]?.timestampSource;
      orderValue = contacts[0]?.orderValue;
      orderValueLabel = contacts[0]?.orderValueLabel ?? undefined;
    }

    return {
      id,
      filename: file.name,
      previewUrl,
      contacts,
      status: contacts.length > 0 ? 'found' : 'none',
      orderTimeLabel,
      timestampSource,
      orderValue,
      orderValueLabel,
    };
  } catch {
    try {
      const result = await ocrImageClient(file);
      const contacts = enrichWithOrderMeta(result.text, result.contacts);
      return {
        id,
        filename: file.name,
        previewUrl,
        contacts,
        status: contacts.length > 0 ? 'found' : 'none',
        orderTimeLabel: contacts[0]?.orderTimeLabel,
        timestampSource: contacts[0]?.timestampSource,
        orderValue: contacts[0]?.orderValue,
        orderValueLabel: contacts[0]?.orderValueLabel ?? undefined,
      };
    } catch {
      return { id, filename: file.name, previewUrl, contacts: [], status: 'error' };
    }
  }
}

export function CustomerImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageBatches, setImageBatches] = useState<ProcessedImage[]>([]);
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [optInFilter, setOptInFilter] = useState<OptInFilter>('all');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [importWizard, setImportWizard] = useState<{
    contacts: ExtractedContact[];
    index: number;
  } | null>(null);
  const [screenshotCount, setScreenshotCount] = useState(0);
  const [reprocessing, setReprocessing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [archiveResults, setArchiveResults] = useState<
    { filename: string; orderValue: number | null; screenType: string; rejectReason: string | null }[]
  >([]);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const loadScreenshots = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/screenshots`);
      if (res.ok) {
        const data = await res.json();
        setScreenshotCount((data.screenshots || []).length);
      }
    } catch {
      // offline
    }
  }, []);

  const reprocessScreenshots = async () => {
    setReprocessing(true);
    setStatus('Re-running OCR on stored screenshots…');
    try {
      const res = await fetch(`${API_URL}/api/screenshots/reprocess`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const withValue = (data.results || []).filter(
          (r: { orderValue?: number | null }) => (r.orderValue ?? 0) > 0,
        ).length;
        setStatus(`Re-OCR done: ${data.processed} screenshot(s), ${withValue} with a total detected.`);
        setScreenshotCount((data.screenshots || []).length);
      } else {
        setStatus(data.error || 'Reprocess failed');
      }
    } catch {
      setStatus('Cannot reach server to reprocess screenshots.');
    }
    setReprocessing(false);
  };

  const archiveScreenshotsOnly = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setArchiving(true);
    setStatus('Adding screenshots to archive (contacts & orders untouched)…');
    try {
      const snapshots = await Promise.all(
        Array.from(files).map((file, i) => snapshotFile(file, i)),
      );
      const formData = new FormData();
      const captureTimes: string[] = [];
      for (const file of snapshots) {
        formData.append('images', file);
        const ms = await extractImageCaptureMs(file);
        if (ms) captureTimes.push(new Date(ms).toISOString());
        else captureTimes.push('');
      }
      if (captureTimes.some(Boolean)) {
        formData.append('imageCaptureTimes', JSON.stringify(captureTimes));
      }
      const res = await fetch(`${API_URL}/api/screenshots/archive`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setScreenshotCount(data.total ?? screenshotCount + (data.stored ?? 0));
        const items = (data.screenshots || []) as {
          filename: string;
          orderValue: number | null;
          screenType?: string;
          rejectReason?: string | null;
        }[];
        setArchiveResults(
          items.map((s) => ({
            filename: s.filename,
            orderValue: s.orderValue,
            screenType: s.screenType || 'unknown',
            rejectReason: s.rejectReason ?? null,
          })),
        );
        const wrong = items.filter((s) => s.screenType === 'edit_call' || s.rejectReason).length;
        const withValue = items.filter((s) => s.orderValue != null && s.orderValue > 0).length;
        setStatus(
          `Archived ${data.stored} screenshot(s). ` +
            `${withValue} with order total detected. ` +
            (wrong
              ? `${wrong} wrong or unusable — see list below. Use order DETAIL screenshots (Total line), not the edit/call screen. `
              : '') +
            'Tap “Reconcile order values” when ready.',
        );
      } else {
        setStatus(data.error || 'Archive upload failed');
      }
    } catch {
      setStatus('Cannot reach server for archive upload.');
    }
    setArchiving(false);
    if (archiveInputRef.current) archiveInputRef.current.value = '';
  };

  const reconcileOrderValues = async () => {
    setReconciling(true);
    setStatus('Matching screenshots to orders by phone + EXIF time + name…');
    try {
      const res = await fetch(`${API_URL}/api/orders/reconcile-values`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const updatedList = (data.results || [])
          .filter((r: { status: string }) => r.status === 'updated')
          .slice(0, 5)
          .map((r: { name: string; orderValue: number }) => `${r.name} → S$${r.orderValue}`)
          .join(', ');
        setStatus(
          `Reconcile done: ${data.updated} order value(s) added. ` +
            `${data.unmatchedOrders} order(s) still without value. ` +
            `${data.unmatchedScreenshots} screenshot(s) not matched.` +
            (updatedList ? ` Examples: ${updatedList}.` : '') +
            ' Refresh Orders page.',
        );
      } else {
        setStatus(data.error || 'Reconcile failed');
      }
    } catch {
      setStatus('Cannot reach server to reconcile values.');
    }
    setReconciling(false);
  };

  const allContacts = imageBatches.flatMap((b) => b.contacts);

  const optInStats = useMemo(() => {
    const views = savedContacts.map(resolveOptInView);
    return {
      all: savedContacts.length,
      awaiting: views.filter((v) => v.welcomeStatus === 'sent_awaiting').length,
      queued: views.filter((v) => v.welcomeStatus === 'queued').length,
      not_sent: views.filter((v) => v.welcomeStatus === 'not_sent').length,
      opted_in: views.filter((v) => v.pref !== 'unset' && v.pref !== 'opt_out').length,
      opted_out: views.filter((v) => v.pref === 'opt_out').length,
    };
  }, [savedContacts]);

  const filteredSavedContacts = useMemo(
    () =>
      savedContacts.filter((c) => matchesOptInFilter(resolveOptInView(c), optInFilter)),
    [savedContacts, optInFilter],
  );

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/contacts?enriched=1`);
      if (res.ok) {
        const data = await res.json();
        setSavedContacts(data.contacts || []);
      }
    } catch {
      // API may be offline
    }
  }, []);

  useEffect(() => {
    loadSaved();
    loadScreenshots();
  }, [loadSaved, loadScreenshots]);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setStatus('');

    // Snapshot all files into memory immediately — iOS Safari drops FileList refs after await
    const fileSnapshots = await Promise.all(
      Array.from(files).map((file, i) => snapshotFile(file, i))
    );

    const newBatches: ProcessedImage[] = [];

    for (let i = 0; i < fileSnapshots.length; i++) {
      const file = fileSnapshots[i];
      setProgress(`Processing image ${i + 1} of ${fileSnapshots.length}: ${file.name}`);
      const batch = await processOneImage(file, i);
      newBatches.push(batch);
    }

    setImageBatches((prev) => [...newBatches, ...prev]);
    setProcessing(false);
    setProgress('');
    loadScreenshots();

    const found = newBatches.filter((b) => b.status === 'found').length;
    const none = newBatches.filter((b) => b.status === 'none').length;
    const errors = newBatches.filter((b) => b.status === 'error').length;
    const totalContacts = newBatches.reduce((n, b) => n + b.contacts.length, 0);

    if (totalContacts === 0) {
      setStatus(`Processed ${fileSnapshots.length} image(s) — no contacts found. Try a clearer screenshot.`);
    } else {
      setStatus(
        `Processed ${fileSnapshots.length} image(s): ${found} with contacts (${totalContacts} total)${none ? `, ${none} with no match` : ''}${errors ? `, ${errors} failed` : ''}.`
      );
    }
  };

  const updateContact = (id: string, field: 'name' | 'phone', value: string) => {
    setImageBatches((prev) =>
      prev.map((batch) => ({
        ...batch,
        contacts: batch.contacts.map((c) =>
          c.id === id ? { ...c, [field]: value } : c
        ),
      }))
    );
  };

  const toggleSelect = (id: string) => {
    setImageBatches((prev) =>
      prev.map((batch) => ({
        ...batch,
        contacts: batch.contacts.map((c) =>
          c.id === id ? { ...c, selected: !c.selected } : c
        ),
      }))
    );
  };

  const removeBatch = (batchId: string) => {
    setImageBatches((prev) => {
      const batch = prev.find((b) => b.id === batchId);
      if (batch) URL.revokeObjectURL(batch.previewUrl);
      return prev.filter((b) => b.id !== batchId);
    });
  };

  const removeContact = (id: string) => {
    setImageBatches((prev) =>
      prev
        .map((batch) => ({
          ...batch,
          contacts: batch.contacts.filter((c) => c.id !== id),
          status: batch.contacts.filter((c) => c.id !== id).length > 0 ? batch.status : 'none',
        }))
        .filter((batch) => batch.status !== 'none' || batch.contacts.length > 0)
    );
  };

  const setAllSelected = (selected: boolean) => {
    setImageBatches((prev) =>
      prev.map((batch) => ({
        ...batch,
        contacts: batch.contacts.map((c) => ({ ...c, selected })),
      }))
    );
  };

  const saveToDatabase = async () => {
    const selected = getSelectedContacts(allContacts);
    if (selected.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: selected }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedContacts(data.contacts || []);
        setImageBatches((prev) =>
          prev
            .map((batch) => ({
              ...batch,
              contacts: batch.contacts.filter((c) => !c.selected),
            }))
            .filter((batch) => batch.contacts.length > 0)
        );
        const returning = data.returning?.length ?? 0;
        const enrolled = data.enrolled?.length ?? 0;
        const skipped = data.skipped?.length ?? 0;
        setStatus(
          `Saved ${data.saved ?? data.new?.length ?? 0} new customer(s).` +
            (returning ? ` ${returning} returning order(s) logged.` : '') +
            (skipped ? ` ${skipped} already saved (duplicate screenshot skipped).` : '') +
            (enrolled ? ` ${enrolled} enrolled in follow-up campaign.` : '')
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`Save failed: ${err.error || res.statusText}. Check Mac server is running.`);
      }
    } catch {
      setStatus('Cannot reach Mac server. Is Tailscale on? Run install-autostart.sh on Mac.');
    }
    setSaving(false);
  };

  const startImportWizard = (contactsToImport: ExtractedContact[]) => {
    if (contactsToImport.length === 0) return;
    setImportWizard({ contacts: contactsToImport, index: 0 });
    setStatus(`Import ${contactsToImport.length} contact(s) one by one — tap Add for each.`);
  };

  const addCurrentWizardContact = () => {
    if (!importWizard) return;
    const contact = importWizard.contacts[importWizard.index];
    openVCardOnDevice(toSingleVCard(contact));
  };

  const nextWizardStep = () => {
    if (!importWizard) return;
    const nextIndex = importWizard.index + 1;
    if (nextIndex >= importWizard.contacts.length) {
      setImportWizard(null);
      setStatus(`All ${importWizard.contacts.length} contact(s) sent to iPhone Contacts.`);
      return;
    }
    setImportWizard({ ...importWizard, index: nextIndex });
  };

  const importToIphoneContacts = (contactsToImport: ExtractedContact[]) => {
    if (contactsToImport.length === 0) return;
    // iOS Safari cannot batch-import from web — use step-by-step wizard
    if (isIOS) {
      startImportWizard(contactsToImport);
      return;
    }
    const file = buildVCardFile(contactsToImport);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${contactsToImport.length} contact(s) as .vcf`);
  };

  const importAllToIphone = () => importToIphoneContacts(allContacts);

  const downloadVCard = () => {
    const selected = getSelectedContacts(allContacts);
    if (selected.length === 0) return;
    importToIphoneContacts(selected);
  };

  const selectedCount = getSelectedContacts(allContacts).length;

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl">Customer Import</h1>
          <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">
            Upload Grab screenshots — each image is one order. Name, phone, and order time (from screenshot timestamp) are extracted automatically.
          </p>
          <CustomerAdminNav />
        </div>
      </header>

      <main className={`max-w-4xl mx-auto px-4 py-8 sm:px-8 space-y-8 ${allContacts.length > 0 ? 'pb-32' : ''}`}>
        {serverOk === false && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-800">
            <strong>Mac server offline.</strong> Saving won&apos;t work. On your Mac run:{' '}
            <code className="bg-red-100 px-1 rounded">./scripts/install-autostart.sh</code>
          </div>
        )}
        {serverOk === true && (
          <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Connected to Mac — every screenshot is stored on the Mac and can be reprocessed later.
          </div>
        )}

        <section className="bg-white rounded-xl border border-mediterranean-300 p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-display text-lg text-ink-900">One-time order value backfill</h2>
            <p className="text-sm text-ink-500 mt-1">
              Safe mode — does <strong>not</strong> create or overwrite contacts or order counts.
              Only adds <code className="text-xs bg-cream-400 px-1 rounded">order_value</code> by matching
              phone + EXIF photo time + name.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-1">
            <p className="font-medium">Grab edit/call screenshots work</p>
            <p>
              The app reads the edit cap (e.g. S$37.80) and % (20%) and computes{' '}
              <strong>order value = cap ÷ (1 + 20%)</strong>. Order detail screenshots with a
              Total line are used when available.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <button
              type="button"
              onClick={() => archiveInputRef.current?.click()}
              disabled={archiving}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium border border-mediterranean-400 text-mediterranean-800 px-4 py-2.5 rounded-lg hover:bg-mediterranean-50 disabled:opacity-50"
            >
              {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              1. Add screenshots to archive
            </button>
            <input
              ref={archiveInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => archiveScreenshotsOnly(e.target.files)}
            />
            <button
              type="button"
              onClick={reconcileOrderValues}
              disabled={reconciling || screenshotCount === 0}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium bg-mediterranean-700 text-white px-4 py-2.5 rounded-lg hover:bg-mediterranean-800 disabled:opacity-50"
            >
              {reconciling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              2. Reconcile order values
            </button>
          </div>

          <p className="text-xs text-ink-500">
            {screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''} in Mac archive.
            Reconcile after archiving order-detail screenshots with a visible Total line.
          </p>

          {archiveResults.length > 0 && (
            <ul className="text-xs space-y-1 border border-beige-600 rounded-lg p-3 bg-cream-50 max-h-40 overflow-y-auto">
              {archiveResults.map((r) => (
                <li
                  key={r.filename}
                  className={
                    r.rejectReason || r.screenType === 'edit_call'
                      ? 'text-red-700'
                      : r.orderValue
                        ? 'text-green-800'
                        : 'text-ink-500'
                  }
                >
                  <span className="font-medium">{r.filename}</span>
                  {r.orderValue != null && r.orderValue > 0 ? (
                    <> — {formatSgd(r.orderValue)}</>
                  ) : r.rejectReason ? (
                    <> — {r.rejectReason}</>
                  ) : (
                    <> — no Total detected</>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {screenshotCount > 0 && (
          <p className="text-xs text-ink-400 text-center">
            <button
              type="button"
              onClick={reprocessScreenshots}
              disabled={reprocessing}
              className="underline hover:text-ink-600 disabled:opacity-50"
            >
              {reprocessing ? 'Re-running OCR…' : 'Re-run OCR on archive (advanced)'}
            </button>
          </p>
        )}
        <section className="bg-white rounded-xl border border-beige-600 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h2 className="font-display text-xl text-ink-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-mediterranean-700" />
                Upload Screenshots
              </h2>
              <p className="text-ink-500 text-sm mt-1">
                Select multiple images — one screenshot = one order. Order time = iPhone Photos &quot;Original&quot; date (photo metadata).
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="inline-flex items-center gap-2 bg-mediterranean-700 hover:bg-mediterranean-800 text-white px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {processing ? 'Processing...' : 'Select Images'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {progress && <p className="text-sm text-mediterranean-700 mt-4">{progress}</p>}
          {status && (
            <p className="text-sm text-ink-600 mt-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-mediterranean-600 shrink-0" />
              {status}
            </p>
          )}
        </section>

        {imageBatches.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <h2 className="font-display text-xl text-ink-900">
                Results by image ({selectedCount} selected)
              </h2>
              {allContacts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAllSelected(true)}
                    className="inline-flex items-center gap-2 border border-beige-600 text-ink-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-cream-400"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={downloadVCard}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-2 border border-mediterranean-700 text-mediterranean-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-mediterranean-100 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    Export vCard ({selectedCount})
                  </button>
                  <button
                    type="button"
                    onClick={saveToDatabase}
                    disabled={selectedCount === 0 || saving}
                    className="inline-flex items-center gap-2 bg-mediterranean-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-mediterranean-800 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save to Customer Base
                  </button>
                </div>
              )}
            </div>

            {imageBatches.map((batch) => (
              <div key={batch.id} className="bg-white rounded-xl border border-beige-600 p-4 shadow-sm">
                <div className="flex gap-4">
                  <img
                    src={batch.previewUrl}
                    alt={batch.filename}
                    className="w-20 h-20 object-cover rounded-lg border border-beige-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-700 truncate">{batch.filename}</p>
                        {batch.orderTimeLabel && (
                          <p className="text-xs text-mediterranean-700 mt-0.5">
                            Order: {batch.orderTimeLabel}
                            {batch.timestampSource === 'exif'
                              ? ' (iPhone photo time)'
                              : batch.timestampSource === 'ocr'
                                ? ' (from Grab text)'
                                : ''}
                          </p>
                        )}
                        {batch.orderValue != null && batch.orderValue > 0 && (
                          <p className="text-xs text-green-800 font-medium mt-0.5">
                            Order value: {formatSgd(batch.orderValue)}
                            {batch.orderValueLabel ? ` (${batch.orderValueLabel})` : ''}
                          </p>
                        )}
                        {batch.status === 'found' && !batch.orderValue && (
                          <p className="text-xs text-amber-700 mt-0.5">
                            No order total found — use Grab order detail screenshot (shows Total)
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBatch(batch.id)}
                        className="p-1 text-ink-400 hover:text-red-600 shrink-0"
                        aria-label="Remove image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {batch.status === 'error' && (
                      <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Could not process this image
                      </p>
                    )}

                    {batch.status === 'none' && (
                      <p className="text-sm text-amber-700 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Processed — no name or phone found in this image
                      </p>
                    )}

                    {batch.status === 'found' && !batch.orderTimeLabel && (
                      <p className="text-sm text-amber-700 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        No photo timestamp found — pick the image from Photos (not a re-shared copy)
                      </p>
                    )}

                    {batch.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`flex flex-col sm:flex-row gap-3 p-3 mt-3 rounded-lg border ${
                          contact.selected
                            ? 'border-mediterranean-300 bg-mediterranean-50'
                            : 'border-beige-500 bg-cream-400'
                        }`}
                      >
                        <label className="flex items-center gap-2 sm:w-8 shrink-0">
                          <input
                            type="checkbox"
                            checked={isContactSelected(contact)}
                            onChange={() => toggleSelect(contact.id)}
                            className="w-4 h-4 accent-mediterranean-700"
                          />
                        </label>
                        <div className="flex-1 space-y-1">
                          <input
                            value={contact.name}
                            onChange={(e) => updateContact(contact.id, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-beige-600 rounded-lg text-ink-900 bg-white"
                            placeholder="Name"
                          />
                          {contact.orderTimeLabel && (
                            <span className="text-xs text-ink-500 block">
                              Order {formatOrderTime(contact.orderedAt)}
                            </span>
                          )}
                          {contact.orderValue != null && contact.orderValue > 0 && (
                            <span className={`text-xs font-medium ${isHighValueOrder(contact.orderValue) ? 'text-amber-800' : 'text-ink-600'}`}>
                              {formatSgd(contact.orderValue)}
                              {isHighValueOrder(contact.orderValue) ? ' · high-value order' : ''}
                            </span>
                          )}
                          {!contact.existing && contact.customer_type === 'first_time' && (
                            <span className="text-xs text-green-700 font-medium">
                              ✨ First order — will join follow-up campaign
                            </span>
                          )}
                          {contact.existing && (
                            <span className="text-xs text-amber-700 font-medium">
                              ↩ Order #{contact.order_count ?? '?'} — returning customer
                            </span>
                          )}
                        </div>
                        <input
                          value={contact.phone}
                          onChange={(e) => updateContact(contact.id, 'phone', e.target.value)}
                          className="flex-1 px-3 py-2 border border-beige-600 rounded-lg text-ink-900 bg-white font-mono text-sm"
                          placeholder="Phone"
                        />
                        <button
                          type="button"
                          onClick={() => removeContact(contact.id)}
                          className="p-2 text-ink-400 hover:text-red-600 self-end sm:self-center"
                          aria-label="Remove contact"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {savedContacts.length > 0 && (
          <section className="bg-white rounded-xl border border-beige-600 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="font-display text-xl text-ink-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-mediterranean-700" />
                Saved Customer Base ({savedContacts.length})
              </h2>
              <Link
                to="/customers/orders"
                className="text-sm text-mediterranean-700 font-medium hover:underline"
              >
                View order analytics →
              </Link>
            </div>

            <div className="mb-4 rounded-xl border border-mediterranean-200 bg-mediterranean-50/50 p-4 space-y-3">
              <p className="text-sm font-semibold text-ink-900">Neighbourhood Welcome opt-in</p>
              <p className="text-xs text-ink-600 leading-relaxed">
                <strong>Welcome</strong>: To send = not sent yet · Sent = Luca messaged them · Replied = they tapped the poll.{' '}
                <strong>Opt-in</strong> = what they chose (or still waiting).
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', `All (${optInStats.all})`],
                    ['awaiting', `Sent (${optInStats.awaiting})`],
                    ['queued', `To send (${optInStats.queued})`],
                    ['not_sent', `Not sent (${optInStats.not_sent})`],
                    ['opted_in', `Opted in (${optInStats.opted_in})`],
                    ['opted_out', `Opted out (${optInStats.opted_out})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOptInFilter(key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      optInFilter === key
                        ? 'bg-ink-800 text-white border-ink-800'
                        : 'bg-white text-ink-600 border-beige-600 hover:bg-cream-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-500 border-b border-beige-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Phone</th>
                    <th className="pb-2 pr-4">Orders</th>
                    <th className="pb-2 pr-4 whitespace-nowrap">First order</th>
                    <th className="pb-2 pr-4 whitespace-nowrap">Last order</th>
                    <th className="pb-2 pr-4 whitespace-nowrap min-w-[5.5rem]">Welcome</th>
                    <th className="pb-2 whitespace-nowrap min-w-[6.5rem]">Opt-in</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSavedContacts.map((c) => {
                    const view = resolveOptInView(c);
                    return (
                    <tr key={c.id} className="border-b border-beige-400 last:border-0">
                      <td className="py-2 pr-4 text-ink-800 font-medium">{c.name}</td>
                      <td className="py-2 pr-4 font-mono text-ink-600 text-xs whitespace-nowrap">
                        {c.phone?.startsWith('pending-') ? (
                          <span className="text-ink-400 italic">No phone yet</span>
                        ) : (
                          c.phone
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className="font-medium text-mediterranean-800">
                          {c.orderStats?.count ?? c.order_count ?? 1}
                        </span>
                        {c.customer_type === 'returning' && (
                          <span className="text-xs text-amber-700 ml-1">repeat</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-ink-600 text-xs whitespace-nowrap">
                        {formatOrderTime(c.orderStats?.firstOrderAt)}
                      </td>
                      <td className="py-2 pr-4 text-ink-600 text-xs whitespace-nowrap">
                        {formatOrderTime(c.orderStats?.lastOrderAt)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <StatusTag
                          label={view.welcomeShortLabel}
                          className={view.welcomeChipClass}
                          title={view.welcomeLabel}
                        />
                        {view.welcomeSentAt && (
                          <span className="block text-[10px] text-ink-400 mt-1 tabular-nums">
                            {formatOrderTimeShort(view.welcomeSentAt)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {view.prefShortLabel ? (
                          <>
                            <StatusTag
                              label={view.prefShortLabel}
                              className={view.prefChipClass}
                              title={view.prefLabel || view.prefShortLabel}
                            />
                            {view.prefUpdatedAt && (
                              <span className="block text-[10px] text-ink-400 mt-1 tabular-nums">
                                {formatOrderTimeShort(view.prefUpdatedAt)}
                              </span>
                            )}
                          </>
                        ) : view.welcomeStatus === 'sent_awaiting' ? (
                          <StatusTag
                            label="No reply"
                            className="bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
                            title="Waiting for poll reply"
                          />
                        ) : (
                          <span className="text-xs text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredSavedContacts.length === 0 && (
                <p className="text-sm text-ink-500 text-center py-8">No customers in this filter.</p>
              )}
            </div>
          </section>
        )}

        <p className="text-center text-ink-400 text-sm pb-8">
          <Link to="/" className="hover:text-mediterranean-700 underline">
            ← Back to website
          </Link>
        </p>
      </main>

      {allContacts.length > 0 && !importWizard && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-beige-600 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={importAllToIphone}
            className="w-full flex items-center justify-center gap-2 bg-[#00B14F] hover:bg-[#009a45] text-white py-4 rounded-xl text-lg font-semibold transition-colors"
          >
            <Contact className="w-6 h-6" />
            Import All to iPhone Contacts ({allContacts.length})
          </button>
          <p className="text-center text-ink-400 text-xs mt-2">
            iPhone adds one at a time — quick tap Add for each contact
          </p>
        </div>
      )}

      {importWizard && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-2xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
            <p className="text-sm text-mediterranean-700 font-medium">
              Contact {importWizard.index + 1} of {importWizard.contacts.length}
            </p>
            <h3 className="font-display text-2xl text-ink-900 mt-1">
              {importWizard.contacts[importWizard.index].name}
            </h3>
            <p className="font-mono text-lg text-ink-600 mt-1">
              {importWizard.contacts[importWizard.index].phone?.startsWith('pending-') ||
              !importWizard.contacts[importWizard.index].phone
                ? 'No phone yet'
                : importWizard.contacts[importWizard.index].phone}
            </p>

            <button
              type="button"
              onClick={addCurrentWizardContact}
              className="w-full mt-5 flex items-center justify-center gap-2 bg-[#00B14F] text-white py-4 rounded-xl text-lg font-semibold"
            >
              <Contact className="w-6 h-6" />
              Add to Contacts
            </button>

            <p className="text-center text-ink-400 text-xs mt-3">
              Tap Create New Contact on the iPhone screen, then come back here
            </p>

            <button
              type="button"
              onClick={nextWizardStep}
              className="w-full mt-3 py-3 rounded-xl border border-mediterranean-700 text-mediterranean-700 font-semibold"
            >
              {importWizard.index + 1 >= importWizard.contacts.length
                ? 'Done'
                : `Next → (${importWizard.index + 2} of ${importWizard.contacts.length})`}
            </button>

            <button
              type="button"
              onClick={() => setImportWizard(null)}
              className="w-full mt-2 py-2 text-ink-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
