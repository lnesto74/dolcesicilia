import { execSync } from 'child_process';

const WEB_PORT = Number(process.env.WEB_PORT) || 5173;
const CACHE_MS = 60_000;

let tailscaleCache = { at: 0, ip: '' };

function refreshTailscaleCache() {
  const now = Date.now();
  if (now - tailscaleCache.at < CACHE_MS) return;

  let ip = '';
  try {
    ip = execSync('tailscale ip -4', { encoding: 'utf8', timeout: 3000 })
      .trim()
      .split(/\s+/)[0]
      .trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) ip = '';
  } catch {
    /* tailscale unavailable */
  }

  tailscaleCache = { at: now, ip };
}

/** Tailscale IPv4 on this Mac (100.x.x.x), same as run-servers.sh / status.sh. */
export function detectTailscaleIp() {
  refreshTailscaleCache();
  return tailscaleCache.ip;
}

/**
 * Base URL for WhatsApp tracking links.
 * Priority: manual setting → PUBLIC_BASE_URL → http://{tailscale-ip}:5173
 */
export function resolvePublicWebBase({ setting = '', envUrl = '' } = {}) {
  const fromSetting = String(setting || '').trim().replace(/\/$/, '');
  if (fromSetting) return { base: fromSetting, source: 'setting' };

  const fromEnv = String(envUrl || '').trim().replace(/\/$/, '');
  if (fromEnv) return { base: fromEnv, source: 'env' };

  const ip = detectTailscaleIp();
  if (ip) return { base: `http://${ip}:${WEB_PORT}`, source: 'tailscale' };

  return { base: '', source: '' };
}
