import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { AdminPageShell } from '../components/messaging/AdminPageShell';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import { WholesaleMap } from '../components/wholesale/WholesaleMap';
import { WholesaleStatusChip } from '../components/wholesale/WholesaleStatusChip';
import {
  WHOLESALE_ZONES,
  PIPELINE_STATUSES,
  STATUS_LABELS,
  DEFAULT_WHOLESALE_TEMPLATE,
  fillWholesaleTemplate,
  type WholesaleLeadStatus,
} from '../lib/wholesaleZones';
import { API_URL, apiUnreachableMessage, parseApiJson } from '../lib/api';
import { getPhoneValidationWarning } from '@shared/phoneValidation';

interface WholesaleLead {
  id: string;
  name: string;
  type?: string | null;
  zone?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  fit_note?: string | null;
  priority?: number | null;
  status: WholesaleLeadStatus | string;
  last_contacted_at?: string | null;
  lastSentAt?: string | null;
}

interface QueueItem {
  id: string;
  leadId: string;
  leadName: string;
  messageBody: string;
  phone?: string | null;
  createdAt?: string;
  leadStatus?: string;
  fitNote?: string | null;
}

function skipReasonLabel(reason: string, detail?: string) {
  if (reason === 'recent_message') return detail || 'Contacted within 14 days';
  if (reason === 'duplicate_message') return detail || 'Duplicate message';
  if (reason === 'pending_in_queue') return 'Already queued';
  if (reason === 'no_phone') return 'No phone number';
  return detail || reason;
}

export function CustomerWholesale() {
  const [leads, setLeads] = useState<WholesaleLead[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('tanjong-pagar-cbd');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);
  const [templateBody, setTemplateBody] = useState(DEFAULT_WHOLESALE_TEMPLATE);
  const [showPipeline, setShowPipeline] = useState(true);
  const [sending, setSending] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [skipped, setSkipped] = useState<
    Array<{ leadId: string; leadName?: string; reason: string; detail?: string }>
  >([]);

  const activeZone = useMemo(
    () => WHOLESALE_ZONES.find((z) => z.id === selectedZoneId) ?? WHOLESALE_ZONES[0],
    [selectedZoneId],
  );

  const zoneLeads = useMemo(
    () => leads.filter((l) => !activeZone.dbZone || l.zone === activeZone.dbZone),
    [leads, activeZone],
  );

  const loadData = useCallback(async () => {
    try {
      const [leadsRes, queueRes] = await Promise.all([
        fetch(`${API_URL}/api/wholesale/leads`),
        fetch(`${API_URL}/api/wholesale/queue`),
      ]);
      if (!leadsRes.ok) {
        const err = await parseApiJson(leadsRes);
        throw new Error(typeof err === 'string' ? err : (err as { error?: string }).error || 'Failed to load leads');
      }
      if (!queueRes.ok) {
        const err = await parseApiJson(queueRes);
        throw new Error(typeof err === 'string' ? err : (err as { error?: string }).error || 'Failed to load queue');
      }
      const leadsData = await leadsRes.json();
      const queueData = await queueRes.json();
      setLeads(leadsData.leads || []);
      setQueue(queueData.queue || []);
    } catch (err) {
      const msg =
        err instanceof Error && err.message && !/fetch|network/i.test(err.message)
          ? err.message
          : apiUnreachableMessage(err);
      setStatusMsg(msg.includes('restart') ? msg : `${msg} Try ./scripts/restart.sh`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 20000);
    return () => clearInterval(id);
  }, [loadData]);

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const selectAllZoneLeads = () => {
    setSelectedLeadIds(new Set(zoneLeads.map((l) => l.id)));
  };

  const clearSelection = () => setSelectedLeadIds(new Set());

  const queueFromTemplate = async () => {
    const ids = selectedLeadIds.size ? [...selectedLeadIds] : zoneLeads.map((l) => l.id);
    if (!ids.length) {
      setStatusMsg('Select at least one lead.');
      return;
    }
    setQueueing(true);
    setSkipped([]);
    setStatusMsg('');
    try {
      const items = ids.map((leadId) => {
        const lead = leads.find((l) => l.id === leadId);
        return {
          leadId,
          body: fillWholesaleTemplate(templateBody, lead?.name || 'there'),
        };
      });
      const res = await fetch(`${API_URL}/api/wholesale/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Queue failed');
      setQueue(data.queue || []);
      setSkipped(data.skipped || []);
      setStatusMsg(
        data.queued?.length
          ? `Queued ${data.queued.length} proposal${data.queued.length === 1 ? '' : 's'}.`
          : 'Nothing queued — see skipped reasons.',
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Queue failed');
    } finally {
      setQueueing(false);
    }
  };

  const sendQueueItem = async (item: QueueItem) => {
    setSending(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${API_URL}/api/wholesale/send-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ leadId: item.leadId, messageBody: item.messageBody, outreachId: item.id }],
        }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || result?.error || `Send failed for ${item.leadName}`,
        );
      }
      setLeads(data.leads || []);
      setQueue(data.queue || []);
      setStatusMsg(`Sent to ${item.leadName} via OpenWA.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const sendAllQueue = async () => {
    if (!queue.length) return;
    setSending(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${API_URL}/api/wholesale/send-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: queue.map((q) => ({
            leadId: q.leadId,
            messageBody: q.messageBody,
            outreachId: q.id,
          })),
        }),
      });
      const data = await res.json();
      setLeads(data.leads || []);
      setQueue(data.queue || []);
      if (data.ok) {
        setStatusMsg(`Sent ${data.sent} message${data.sent === 1 ? '' : 's'} via OpenWA.`);
      } else {
        const fail = data.results?.find((r: { ok: boolean; error?: string }) => !r.ok);
        setStatusMsg(
          fail?.error ||
            `Send stopped — sent ${data.sent ?? 0}, failed ${data.failed ?? 0}. Try one lead at a time.`,
        );
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const removeFromQueue = async (leadId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/wholesale/queue`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQueue(data.queue || []);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not remove from queue');
    }
  };

  const updateLeadStatus = async (leadId: string, status: WholesaleLeadStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/wholesale/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeads(data.leads || []);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const pipelineGroups = useMemo(() => {
    const map = new Map<string, WholesaleLead[]>();
    for (const s of PIPELINE_STATUSES) map.set(s, []);
    for (const lead of zoneLeads) {
      const key = PIPELINE_STATUSES.includes(lead.status as WholesaleLeadStatus)
        ? (lead.status as WholesaleLeadStatus)
        : 'new';
      map.get(key)!.push(lead);
    }
    return map;
  }, [zoneLeads]);

  const displayQueue = useMemo(() => {
    if (!activeZone.dbZone) return queue;
    const zoneLeadIds = new Set(zoneLeads.map((l) => l.id));
    return queue.filter((q) => zoneLeadIds.has(q.leadId));
  }, [queue, zoneLeads, activeZone]);

  const focusedLead = focusedLeadId ? leads.find((l) => l.id === focusedLeadId) : null;

  return (
    <AdminPageShell
      title="Wholesale"
      subtitle="B2B café outreach — Claude (MCP) composes, Luca reviews and sends via OpenWA."
      maxWidth="max-w-7xl"
      headerExtra={<WhatsAppStatusLed variant="header" />}
    >
      <div className="space-y-6">
        <section className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Manual send only · no opt-in poll</p>
          <p className="text-xs mt-1 text-amber-900">
            B2B leads skip the customer preference poll. Dedup and 14-day frequency cap still apply.
            Ask Claude to <code className="text-[11px]">queue_wholesale_message</code> — then review here
            and click Send.
          </p>
        </section>

        {statusMsg && (
          <p className="text-sm text-ink-700 bg-white border border-beige-600 rounded-lg px-4 py-3">
            {statusMsg}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-ink-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading wholesale leads…
          </div>
        ) : (
          <>
            <WholesaleMap
              leads={leads}
              selectedZoneId={selectedZoneId}
              selectedLeadId={focusedLeadId}
              onZoneSelect={setSelectedZoneId}
              onLeadSelect={(id) => {
                setFocusedLeadId(id);
                setSelectedLeadIds(new Set([id]));
              }}
            />

            {focusedLead && (
              <div className="rounded-xl border border-mediterranean-300 bg-white p-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-900">{focusedLead.name}</p>
                    <WholesaleStatusChip status={focusedLead.status} />
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{focusedLead.type}</p>
                  <p className="text-xs text-ink-600 mt-2">{focusedLead.address}</p>
                  <p className="text-xs font-mono text-ink-500 mt-1">
                    {focusedLead.phone || 'No phone'} · {focusedLead.email || '—'}
                  </p>
                  {focusedLead.fit_note && (
                    <p className="text-xs text-mediterranean-800 mt-2 italic">{focusedLead.fit_note}</p>
                  )}
                </div>
                <button type="button" onClick={() => setFocusedLeadId(null)} className="p-1 text-ink-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowPipeline((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-beige-600 bg-white text-sm font-medium text-ink-800"
            >
              <span>Pipeline · {activeZone.name}</span>
              {showPipeline ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showPipeline && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {PIPELINE_STATUSES.map((status) => (
                  <div
                    key={status}
                    className="rounded-xl border border-beige-600 bg-white p-3 min-h-[120px]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-500 mb-2">
                      {STATUS_LABELS[status]}
                    </p>
                    <ul className="space-y-1.5">
                      {(pipelineGroups.get(status) || []).map((lead) => (
                        <li key={lead.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedLeadId(lead.id);
                              toggleLead(lead.id);
                            }}
                            className="text-left text-xs text-ink-800 hover:text-mediterranean-800 w-full truncate"
                          >
                            {lead.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="lg:grid lg:grid-cols-3 lg:gap-6">
              {/* WHO */}
              <section className="space-y-3">
                <h2 className="font-display text-lg text-ink-900">Who</h2>
                <p className="text-xs text-ink-500">
                  Zone: <strong>{activeZone.name}</strong> · {zoneLeads.length} leads. Selection
                  targets the template below — it does not fill Send until you queue.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllZoneLeads}
                    className="text-xs px-2 py-1 rounded border border-beige-600 bg-white"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs px-2 py-1 rounded border border-beige-600 bg-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {zoneLeads.map((lead) => {
                    const selected = selectedLeadIds.has(lead.id);
                    const phoneWarn = lead.phone ? getPhoneValidationWarning(lead.phone) : 'No phone';
                    return (
                      <label
                        key={lead.id}
                        className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selected
                            ? 'border-mediterranean-500 bg-mediterranean-50 ring-2 ring-mediterranean-200'
                            : 'border-beige-600 bg-white hover:bg-cream-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleLead(lead.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-sm text-ink-900">{lead.name}</p>
                            <WholesaleStatusChip status={lead.status} />
                          </div>
                          <p className="text-xs text-ink-500 mt-0.5">{lead.type}</p>
                          {lead.fit_note && (
                            <p className="text-[11px] text-mediterranean-800 mt-1 line-clamp-2">
                              {lead.fit_note}
                            </p>
                          )}
                          {phoneWarn && (
                            <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {phoneWarn}
                            </p>
                          )}
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              updateLeadStatus(lead.id, e.target.value as WholesaleLeadStatus)
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 text-[10px] border border-beige-500 rounded px-1 py-0.5 bg-white"
                          >
                            {PIPELINE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* WHAT */}
              <section className="space-y-3 lg:order-3">
                <h2 className="font-display text-lg text-ink-900">What</h2>
                <p className="text-xs text-ink-500">
                  Claude queue is read-only. Edit the template below for manual drafts — use{' '}
                  <code className="text-[10px]">{'{{name}}'}</code> for the café name.
                </p>

                {displayQueue.length > 0 && (
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto mb-4">
                    <p className="text-xs font-semibold text-mediterranean-800 uppercase tracking-wide">
                      Claude queue (read-only)
                    </p>
                    {displayQueue.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-mediterranean-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-ink-900">{item.leadName}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-mediterranean-800 text-white">
                            MCP queued
                          </span>
                        </div>
                        <pre className="text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-mediterranean-50/50 rounded-lg p-3 border border-beige-400">
                          {item.messageBody}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                <details className="rounded-xl border border-beige-600 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-medium text-mediterranean-900">
                    Draft with Claude (MCP)
                  </summary>
                  <p className="text-xs text-ink-500 mt-2">
                    In Claude Desktop: <code>get_wholesale_leads</code> → compose B2B proposals →{' '}
                    <code>queue_wholesale_message</code>. Messages appear above and in Send.
                  </p>
                </details>

                <label className="block text-xs font-medium text-ink-600">Editable template</label>
                <textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  rows={10}
                  className="w-full text-sm rounded-xl border border-beige-600 p-3 font-sans leading-relaxed"
                />
                <button
                  type="button"
                  onClick={queueFromTemplate}
                  disabled={queueing}
                  className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-mediterranean-800 text-white disabled:opacity-60"
                >
                  {queueing ? 'Queueing…' : `Queue template for ${selectedLeadIds.size || zoneLeads.length} leads`}
                </button>

                {selectedLeadIds.size > 0 && (
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                    <p className="text-xs font-semibold text-ink-600">Preview</p>
                    {[...selectedLeadIds].map((id) => {
                      const lead = leads.find((l) => l.id === id);
                      if (!lead) return null;
                      return (
                        <div key={id} className="rounded-lg border border-beige-500 p-3 bg-cream-400/40">
                          <p className="text-xs font-semibold">{lead.name}</p>
                          <pre className="text-xs whitespace-pre-wrap mt-1 text-ink-700">
                            {fillWholesaleTemplate(templateBody, lead.name)}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* SEND */}
              <section className="space-y-3 lg:order-2">
                <h2 className="font-display text-lg text-ink-900">Send</h2>
                <p className="text-xs text-ink-500">
                  Only messages already queued (Claude MCP or “Queue template”) appear here — then
                  send via OpenWA one by one or all at once.
                </p>

                {skipped.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Skipped
                    </p>
                    <ul className="mt-1 space-y-1">
                      {skipped.map((s) => (
                        <li key={s.leadId}>
                          {s.leadName || s.leadId}: {skipReasonLabel(s.reason, s.detail)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {displayQueue.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-mediterranean-300 bg-mediterranean-50/40 p-6 text-sm text-center text-ink-600">
                    <MapPin className="w-8 h-8 mx-auto text-mediterranean-400 mb-2" />
                    No messages queued for this zone.
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={sendAllQueue}
                      disabled={sending}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-700 text-white font-semibold text-sm disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send all ({displayQueue.length}) via OpenWA
                    </button>
                    <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                      {displayQueue.map((item) => {
                        const phoneWarn = item.phone
                          ? getPhoneValidationWarning(item.phone)
                          : 'No phone — cannot send via WhatsApp';
                        const canSend = !phoneWarn;
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-beige-600 bg-white p-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <p className="font-semibold text-ink-900">{item.leadName}</p>
                              <button
                                type="button"
                                onClick={() => removeFromQueue(item.leadId)}
                                className="text-xs text-ink-400 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                            <pre className="text-xs whitespace-pre-wrap text-ink-700 bg-cream-400/50 rounded-lg p-3 border border-beige-400 mb-3">
                              {item.messageBody}
                            </pre>
                            {phoneWarn && (
                              <p className="text-xs text-amber-700 mb-2 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {phoneWarn}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => sendQueueItem(item)}
                              disabled={sending || !canSend}
                              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-mediterranean-800 text-white text-sm font-medium disabled:opacity-50"
                            >
                              {sending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Send via OpenWA
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AdminPageShell>
  );
}
