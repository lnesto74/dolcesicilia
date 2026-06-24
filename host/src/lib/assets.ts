/** Base path when deployed at tiramisusg.com/host (Next static export does not auto-prefix Image src). */
export const HOST_BASE = "/host";

export function hostAsset(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${HOST_BASE}${normalized}`;
}
