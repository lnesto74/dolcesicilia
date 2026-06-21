export interface WholesaleZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radiusM: number;
  label: string;
  /** Matches wholesale_leads.zone column */
  dbZone: string;
}

export const WHOLESALE_ZONES: WholesaleZone[] = [
  {
    id: 'tanjong-pagar-cbd',
    name: 'Tanjong Pagar / CBD',
    center: { lat: 1.2766, lng: 103.8458 },
    radiusM: 800,
    label: 'Guoco Tower · 1 Wallich St',
    dbZone: 'Tanjong Pagar/CBD',
  },
  {
    id: 'tiong-bahru',
    name: 'Tiong Bahru',
    center: { lat: 1.2865, lng: 103.8268 },
    radiusM: 700,
    label: 'Coming soon',
    dbZone: 'Tiong Bahru',
  },
  {
    id: 'telok-ayer-amoy',
    name: 'Telok Ayer / Amoy',
    center: { lat: 1.2805, lng: 103.8485 },
    radiusM: 600,
    label: 'Coming soon',
    dbZone: 'Telok Ayer/Amoy',
  },
  {
    id: 'holland-village',
    name: 'Holland Village',
    center: { lat: 1.311, lng: 103.7955 },
    radiusM: 700,
    label: 'Coming soon',
    dbZone: 'Holland Village',
  },
  {
    id: 'katong-joo-chiat',
    name: 'Katong / Joo Chiat',
    center: { lat: 1.305, lng: 103.9035 },
    radiusM: 900,
    label: 'Coming soon',
    dbZone: 'Katong/Joo Chiat',
  },
];

export const PIPELINE_STATUSES = [
  'new',
  'contacted',
  'replied',
  'sampling',
  'won',
  'declined',
] as const;

export type WholesaleLeadStatus = (typeof PIPELINE_STATUSES)[number];

export const STATUS_LABELS: Record<WholesaleLeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  sampling: 'Sampling',
  won: 'Won',
  declined: 'Declined',
};

export const STATUS_PIN_COLORS: Record<WholesaleLeadStatus, string> = {
  new: '#9ca3af',
  contacted: '#3b82f6',
  replied: '#f59e0b',
  sampling: '#f59e0b',
  won: '#22c55e',
  declined: '#ef4444',
};

export const DEFAULT_WHOLESALE_TEMPLATE = `Ciao {{name}}! I'm Luca, chef-owner of Dolce Sicilia — artisan Sicilian tiramisù made fresh every morning here in Singapore (currently on Grab). I'm reaching out to a few independent cafés near Guoco Tower I admire, {{name}} among them.

I'd love to supply you our tiramisù — fresh daily, in monoportions or sharing trays, on wholesale or sale-or-return, so you can offer a real handmade Sicilian dessert with zero kitchen effort (Classic, Pistachio, Orange Liqueur).

Could I drop by with samples this week?

Grazie — Luca, Dolce Sicilia.`;

export function fillWholesaleTemplate(body: string, businessName: string) {
  return body
    .replace(/\{\{name\}\}/gi, businessName)
    .replace(/\{\{businessName\}\}/gi, businessName)
    .replace(/\{\{cafe\}\}/gi, businessName)
    .replace(/\{\{Café\}\}/gi, businessName);
}
