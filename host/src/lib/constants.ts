/** Average sale value across mono, flavoured, sharing and tray products (SGD). */
export const BLENDED_BASKET = 18.95;

/** Host revenue share per sale. */
export const HOST_SHARE = 0.2;

export const CALCULATOR_MIN_ITEMS = 5;
export const CALCULATOR_MAX_ITEMS = 30;
export const CALCULATOR_DEFAULT_ITEMS = 14;

export function calculateHostEarnings(itemsPerDay: number) {
  const monthly = Math.round(itemsPerDay * 30 * BLENDED_BASKET * HOST_SHARE);
  const yearly = monthly * 12;
  return { monthly, yearly };
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tiramisusg.com/host";
