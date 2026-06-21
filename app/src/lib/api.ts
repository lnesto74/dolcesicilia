export const API_URL = import.meta.env.VITE_API_URL || '';

/** Parse JSON API responses safely — avoids misleading errors when server returns HTML (e.g. 404). */
export async function parseApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    return {
      error: res.ok
        ? 'Invalid response from server'
        : snippet || `Server error (HTTP ${res.status})`,
    };
  }
}

export function apiUnreachableMessage(err: unknown): string {
  if (err instanceof TypeError && /fetch|network/i.test(String(err.message))) {
    return 'Cannot reach server — is the Mac API running? Try ./scripts/restart.sh';
  }
  return 'Cannot reach server.';
}
