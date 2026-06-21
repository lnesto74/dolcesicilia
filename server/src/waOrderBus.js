import { EventEmitter } from 'events';

export const waOrderBus = new EventEmitter();
waOrderBus.setMaxListeners(50);

export function notifyWaOrderChange(orderId, reason = 'update') {
  waOrderBus.emit('change', { orderId: orderId || null, reason, at: Date.now() });
}
