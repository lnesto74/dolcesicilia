/** Kitchen control panel — driver dispatch row states & timers. */

export interface WaDispatchSnapshot {
  status: string;
  created_at?: string;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
}

export interface WaOrderRowInput {
  status?: string;
  payment_status?: string | null;
  address_text?: string | null;
  updated_at?: string | null;
  dispatch?: WaDispatchSnapshot | null;
}

export type WaDispatchRowPhase =
  | 'none'
  | 'needs_driver'
  | 'finding_driver'
  | 'awaiting_pickup'
  | 'delivering'
  | 'delivered';

export const DRIVER_PICKUP_WARN_MS = 4 * 60 * 1000;

export function waOrderRowPhase(order?: WaOrderRowInput | null): WaDispatchRowPhase {
  if (!order || order.status === 'cancelled') return 'none';

  const dispatch = order.dispatch;
  if (dispatch?.status === 'delivered') return 'delivered';
  if (dispatch?.status === 'picked_up') return 'delivering';
  if (dispatch?.status === 'assigned') return 'awaiting_pickup';
  if (dispatch?.status === 'open') return 'finding_driver';

  if (
    order.payment_status === 'paid' &&
    order.address_text?.trim() &&
    ['paid', 'scheduled'].includes(String(order.status))
  ) {
    return 'needs_driver';
  }

  return 'none';
}

/** @deprecated use waOrderRowPhase */
export function waDispatchRowPhase(dispatch?: WaDispatchSnapshot | null): WaDispatchRowPhase {
  if (!dispatch) return 'none';
  if (dispatch.status === 'delivered') return 'delivered';
  if (dispatch.status === 'picked_up') return 'delivering';
  if (dispatch.status === 'assigned') return 'awaiting_pickup';
  if (dispatch.status === 'open') return 'finding_driver';
  return 'none';
}

export function formatElapsedMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface WaDispatchRowMetrics {
  phase: WaDispatchRowPhase;
  label: string | null;
  elapsedMs: number;
  pickupOverdue: boolean;
  totalMs: number;
}

export function waOrderRowMetrics(
  order?: WaOrderRowInput | null,
  now = Date.now(),
): WaDispatchRowMetrics {
  const phase = waOrderRowPhase(order);
  if (phase === 'none') {
    return { phase, label: null, elapsedMs: 0, pickupOverdue: false, totalMs: 0 };
  }

  const dispatch = order?.dispatch;

  if (phase === 'needs_driver') {
    const since = order?.updated_at ? new Date(order.updated_at).getTime() : now;
    const elapsedMs = now - since;
    return {
      phase,
      label: formatElapsedMs(elapsedMs),
      elapsedMs,
      pickupOverdue: elapsedMs > DRIVER_PICKUP_WARN_MS,
      totalMs: 0,
    };
  }

  if (!dispatch?.created_at) {
    return { phase, label: null, elapsedMs: 0, pickupOverdue: false, totalMs: 0 };
  }

  const created = new Date(dispatch.created_at).getTime();
  const pickedUp = dispatch.picked_up_at ? new Date(dispatch.picked_up_at).getTime() : null;
  const delivered = dispatch.delivered_at ? new Date(dispatch.delivered_at).getTime() : null;

  if (phase === 'delivered' && delivered) {
    const totalMs = delivered - created;
    return {
      phase,
      label: formatElapsedMs(totalMs),
      elapsedMs: totalMs,
      pickupOverdue: false,
      totalMs,
    };
  }

  if (phase === 'delivering' && pickedUp) {
    const elapsedMs = now - pickedUp;
    return {
      phase,
      label: formatElapsedMs(elapsedMs),
      elapsedMs,
      pickupOverdue: false,
      totalMs: 0,
    };
  }

  const elapsedMs = now - created;
  return {
    phase,
    label: formatElapsedMs(elapsedMs),
    elapsedMs,
    pickupOverdue: elapsedMs > DRIVER_PICKUP_WARN_MS,
    totalMs: 0,
  };
}

/** @deprecated use waOrderRowMetrics */
export function waDispatchRowMetrics(
  dispatch?: WaDispatchSnapshot | null,
  now = Date.now(),
): WaDispatchRowMetrics {
  return waOrderRowMetrics({ dispatch }, now);
}

export function waOrderRowHint(metrics: WaDispatchRowMetrics): string | null {
  switch (metrics.phase) {
    case 'needs_driver':
      return metrics.pickupOverdue
        ? 'Find a driver now — customer waiting'
        : 'Tap Find a driver';
    case 'finding_driver':
      return 'Waiting for driver to accept';
    case 'awaiting_pickup':
      return metrics.pickupOverdue ? 'Driver slow to pick up — follow up' : 'Awaiting kitchen pickup';
    case 'delivering':
      return 'Driver en route to customer';
    case 'delivered':
      return `Total ${metrics.label}`;
    default:
      return null;
  }
}

/** @deprecated use waOrderRowHint */
export function waDispatchRowHint(metrics: WaDispatchRowMetrics): string | null {
  return waOrderRowHint(metrics);
}
