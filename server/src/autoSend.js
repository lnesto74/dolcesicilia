import { getSetting } from './db.js';

/** Global kill switch — outbound WhatsApp only when you explicitly send (UI/API). */
export function isAutoSendEnabled() {
  return getSetting('auto_send_enabled', 'false') === 'true';
}
