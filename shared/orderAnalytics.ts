import type { OrderGrowthKpis } from './orderGrowthKpis';
// Runtime implementation lives in orderGrowthKpis.js (shared with server)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JS module without generated declarations
import { computeOrderGrowthKpis } from './orderGrowthKpis.js';

export interface OrderInsight {
  type: 'success' | 'warning' | 'action';
  title: string;
  detail: string;
}

export interface OrderDayRow {
  date: string;
  count: number;
  revenue: number;
  isWeekend: boolean;
  dayLabel: string;
}

export interface ReorderGap {
  days: number;
  from: string;
  to: string;
}

export interface RepeatTimeline {
  contactId: string;
  name?: string;
  phone?: string;
  orderCount: number;
  orders: { orderedAt: string; date: string; label: string }[];
  gaps: ReorderGap[];
  avgDaysBetween: number | null;
}

export interface HeatmapCell {
  day: string;
  hour: number;
  hourLabel: string;
  count: number;
  isWeekend: boolean;
}

export interface OrderHeatmap {
  cells: HeatmapCell[];
  maxCount: number;
  peakSlot: { day: string; hour: number; hourLabel: string; count: number } | null;
}

export interface OrderAnalytics {
  totalOrders: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  uniqueCustomers: number;
  firstTimeOrders: number;
  repeatOrders: number;
  repeatRate: number;
  peakHour: number;
  peakHourCount: number;
  ordersByDay: OrderDayRow[];
  ordersByWeekday: { day: string; count: number; isWeekend: boolean }[];
  byHour: { hour: number; count: number }[];
  heatmapAll: OrderHeatmap;
  heatmapRepeat: OrderHeatmap;
  totalRevenue: number;
  avgOrderValue: number | null;
  ordersWithValue: number;
  revenueByDay: OrderDayRow[];
  topCustomersBySpend: {
    contactId: string;
    name?: string;
    phone?: string;
    orderCount: number;
    totalSpend: number;
    avgOrderValue: number | null;
    lastOrder: string;
  }[];
  repeatTimelines: RepeatTimeline[];
  topRepeat: {
    contactId: string;
    name?: string;
    phone?: string;
    count: number;
    lastOrder: string;
  }[];
  recentOrders: {
    id: string;
    contact_id: string;
    name: string;
    phone: string;
    ordered_at: string;
    is_first_order: number;
    order_value?: number | null;
    customer_type?: string;
  }[];
  insights: OrderInsight[];
  growthKpis: OrderGrowthKpis;
}

interface OrderRow {
  id?: string;
  contact_id: string;
  ordered_at: string;
  is_first_order?: number | boolean;
  order_value?: number | null;
  name?: string;
  phone?: string;
  customer_type?: string;
}

const SG_TZ = 'Asia/Singapore';

function parseOrderDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
}

function dateKeySg(iso: string): string {
  return parseOrderDate(iso).toLocaleDateString('en-CA', { timeZone: SG_TZ });
}

function isWeekendDate(dateKey: string): boolean {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function dayLabelSg(dateKey: string): string {
  return parseOrderDate(`${dateKey}T12:00:00`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function shortOrderLabel(iso: string): string {
  return parseOrderDate(iso).toLocaleString('en-SG', {
    timeZone: SG_TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function sgHour(iso: string): number {
  const h = parseOrderDate(iso).toLocaleString('en-SG', {
    timeZone: SG_TZ,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(h, 10);
}

function sgWeekday(iso: string): (typeof WEEKDAY_ORDER)[number] | null {
  const wd = parseOrderDate(iso).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
  }) as (typeof WEEKDAY_ORDER)[number];
  return WEEKDAY_ORDER.includes(wd) ? wd : null;
}

function hourLabel12(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function buildOrderHeatmap(orders: OrderRow[], repeatOnly = false): OrderHeatmap {
  const grid = new Map<string, number>();
  for (const day of WEEKDAY_ORDER) {
    for (let h = 0; h < 24; h++) grid.set(`${day}-${h}`, 0);
  }

  for (const o of orders) {
    if (repeatOnly && o.is_first_order) continue;
    const day = sgWeekday(o.ordered_at);
    if (!day) continue;
    const hour = sgHour(o.ordered_at);
    const key = `${day}-${hour}`;
    grid.set(key, (grid.get(key) || 0) + 1);
  }

  const cells: HeatmapCell[] = [];
  let maxCount = 0;
  let peakSlot: OrderHeatmap['peakSlot'] = null;

  for (const day of WEEKDAY_ORDER) {
    for (let hour = 0; hour < 24; hour++) {
      const count = grid.get(`${day}-${hour}`) || 0;
      if (count > maxCount) {
        maxCount = count;
        peakSlot = { day, hour, hourLabel: hourLabel12(hour), count };
      }
      cells.push({
        day,
        hour,
        hourLabel: hourLabel12(hour),
        count,
        isWeekend: day === 'Sat' || day === 'Sun',
      });
    }
  }

  return { cells, maxCount, peakSlot };
}

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function fillOrdersByDay(byDay: Map<string, number>, byRevenue: Map<string, number>): OrderDayRow[] {
  if (byDay.size === 0) return [];
  const keys = [...byDay.keys()].sort();
  const rows: OrderDayRow[] = [];
  for (let cur = keys[0]; cur <= keys[keys.length - 1]; cur = addDayKey(cur, 1)) {
    rows.push({
      date: cur,
      count: byDay.get(cur) || 0,
      revenue: Math.round((byRevenue.get(cur) || 0) * 100) / 100,
      isWeekend: isWeekendDate(cur),
      dayLabel: dayLabelSg(cur),
    });
  }
  return rows;
}

function buildRepeatTimelines(orders: OrderRow[]): RepeatTimeline[] {
  const byContact = new Map<string, OrderRow[]>();
  for (const o of orders) {
    if (!byContact.has(o.contact_id)) byContact.set(o.contact_id, []);
    byContact.get(o.contact_id)!.push(o);
  }

  const timelines: RepeatTimeline[] = [];
  for (const [contactId, rows] of byContact) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
    const gaps: ReorderGap[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = parseOrderDate(sorted[i - 1].ordered_at);
      const cur = parseOrderDate(sorted[i].ordered_at);
      const days = Math.round(((cur.getTime() - prev.getTime()) / 86_400_000) * 10) / 10;
      gaps.push({ days, from: sorted[i - 1].ordered_at, to: sorted[i].ordered_at });
    }
    const avgDaysBetween = gaps.length
      ? Math.round((gaps.reduce((s, g) => s + g.days, 0) / gaps.length) * 10) / 10
      : null;
    timelines.push({
      contactId,
      name: sorted[0].name,
      phone: sorted[0].phone,
      orderCount: sorted.length,
      orders: sorted.map((o) => ({
        orderedAt: o.ordered_at,
        date: dateKeySg(o.ordered_at),
        label: shortOrderLabel(o.ordered_at),
      })),
      gaps,
      avgDaysBetween,
    });
  }
  return timelines.sort((a, b) => b.orderCount - a.orderCount || (b.avgDaysBetween ?? 0) - (a.avgDaysBetween ?? 0));
}

export function computeOrderAnalytics(orders: OrderRow[], contacts: { id: string }[] = []): OrderAnalytics {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const totalOrders = orders.length;
  const ordersThisWeek = orders.filter((o) => new Date(o.ordered_at) >= weekAgo).length;
  const ordersThisMonth = orders.filter((o) => new Date(o.ordered_at) >= monthAgo).length;

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  const byDay = new Map<string, number>();
  const byRevenue = new Map<string, number>();
  const weekdayOrder = WEEKDAY_ORDER;
  const byWeekday = new Map(weekdayOrder.map((day) => [day, 0]));
  let firstTimeOrders = 0;
  let repeatOrders = 0;
  let totalRevenue = 0;
  let ordersWithValue = 0;

  for (const o of orders) {
    const hour = sgHour(o.ordered_at);
    byHour[hour].count += 1;
    const dayKey = dateKeySg(o.ordered_at);
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
    const val = o.order_value;
    if (val != null && val > 0) {
      totalRevenue += val;
      ordersWithValue += 1;
      byRevenue.set(dayKey, (byRevenue.get(dayKey) || 0) + val);
    }
    const wd = sgWeekday(o.ordered_at);
    if (wd) byWeekday.set(wd, (byWeekday.get(wd) || 0) + 1);
    if (o.is_first_order) firstTimeOrders += 1;
    else repeatOrders += 1;
  }

  totalRevenue = Math.round(totalRevenue * 100) / 100;
  const avgOrderValue = ordersWithValue
    ? Math.round((totalRevenue / ordersWithValue) * 100) / 100
    : null;

  const peakHour = byHour.reduce((best, cur) => (cur.count > best.count ? cur : best), byHour[0]);
  const ordersByDay = fillOrdersByDay(byDay, byRevenue);
  const revenueByDay = ordersByDay;
  const repeatTimelines = buildRepeatTimelines(orders);
  const heatmapAll = buildOrderHeatmap(orders, false);
  const heatmapRepeat = buildOrderHeatmap(orders, true);

  const byContact = new Map<
    string,
    {
      contactId: string;
      name?: string;
      phone?: string;
      count: number;
      totalSpend: number;
      valuedOrders: number;
      lastOrder: string;
    }
  >();
  for (const o of orders) {
    const key = o.contact_id;
    if (!byContact.has(key)) {
      byContact.set(key, {
        contactId: key,
        name: o.name,
        phone: o.phone,
        count: 0,
        totalSpend: 0,
        valuedOrders: 0,
        lastOrder: o.ordered_at,
      });
    }
    const row = byContact.get(key)!;
    row.count += 1;
    if (o.order_value != null && o.order_value > 0) {
      row.totalSpend += o.order_value;
      row.valuedOrders += 1;
    }
    if (o.ordered_at > row.lastOrder) row.lastOrder = o.ordered_at;
  }
  const topRepeat = [...byContact.values()]
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(({ contactId, name, phone, count, lastOrder }) => ({
      contactId,
      name,
      phone,
      count,
      lastOrder,
    }));

  const topCustomersBySpend = [...byContact.values()]
    .filter((c) => c.totalSpend > 0)
    .map((c) => ({
      contactId: c.contactId,
      name: c.name,
      phone: c.phone,
      orderCount: c.count,
      totalSpend: Math.round(c.totalSpend * 100) / 100,
      avgOrderValue: c.valuedOrders
        ? Math.round((c.totalSpend / c.valuedOrders) * 100) / 100
        : null,
      lastOrder: c.lastOrder,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 15);

  const uniqueCustomers = contacts.length || byContact.size;
  const repeatRate = totalOrders ? Math.round((repeatOrders / totalOrders) * 100) : 0;

  const insights: OrderInsight[] = [];
  if (totalOrders === 0) {
    insights.push({
      type: 'action',
      title: 'No orders logged yet',
      detail: 'Upload Grab screenshots — order time is read from iPhone photo metadata (Original date).',
    });
  } else {
    if (peakHour.count > 0) {
      const label =
        peakHour.hour === 0
          ? '12am'
          : peakHour.hour <= 12
            ? `${peakHour.hour}${peakHour.hour === 12 ? 'pm' : 'am'}`
            : `${peakHour.hour - 12}pm`;
      insights.push({
        type: 'success',
        title: 'Peak order hour',
        detail: `Most orders around ${label} — schedule follow-ups 1–2h after that window.`,
      });
    }
    if (repeatRate >= 30) {
      insights.push({
        type: 'success',
        title: 'Strong repeat rate',
        detail: `${repeatRate}% of logged orders are from returning customers.`,
      });
    }
    if (heatmapRepeat.peakSlot && heatmapRepeat.peakSlot.count > 0) {
      const { day, hourLabel, count } = heatmapRepeat.peakSlot;
      insights.push({
        type: 'success',
        title: 'Repeat order hotspot',
        detail: `Returning customers order most on ${day} around ${hourLabel} (${count} order${count > 1 ? 's' : ''}).`,
      });
    }
    if (ordersThisWeek >= 5) {
      insights.push({
        type: 'success',
        title: 'Active week',
        detail: `${ordersThisWeek} orders in the last 7 days.`,
      });
    }
    if (totalRevenue > 0) {
      insights.push({
        type: 'success',
        title: 'Tracked revenue',
        detail: `${ordersWithValue} order(s) with value logged — ${totalRevenue.toFixed(2)} SGD total (avg ${avgOrderValue?.toFixed(2)} SGD).`,
      });
    }
  }

  return {
    totalOrders,
    ordersThisWeek,
    ordersThisMonth,
    uniqueCustomers,
    firstTimeOrders,
    repeatOrders,
    repeatRate,
    peakHour: peakHour.hour,
    peakHourCount: peakHour.count,
    ordersByDay,
    ordersByWeekday: weekdayOrder.map((day) => ({
      day,
      count: byWeekday.get(day) || 0,
      isWeekend: day === 'Sat' || day === 'Sun',
    })),
    byHour: byHour.filter((h) => h.count > 0),
    heatmapAll,
    heatmapRepeat,
    totalRevenue,
    avgOrderValue,
    ordersWithValue,
    revenueByDay,
    topCustomersBySpend,
    repeatTimelines,
    topRepeat,
    recentOrders: orders.slice(0, 30) as OrderAnalytics['recentOrders'],
    insights,
    growthKpis: computeOrderGrowthKpis(orders),
  };
}
