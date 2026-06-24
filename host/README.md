# Dolce Sicilia — Host Landing Page

High-converting marketing page for recruiting buildings to host a free Dolce Sicilia smart-fridge vending machine. Deployed at **https://www.tiramisusg.com/host** (alias: `/vending`) alongside the main Vite marketing site.

## Routes (production)

| URL | Purpose |
|-----|---------|
| `https://www.tiramisusg.com/host/` | Main landing page |
| `https://www.tiramisusg.com/vending` | Alias — same page |
| `https://www.tiramisusg.com/api/lead` | Lead form API (Vercel serverless) |

## Quick start

```bash
cd host
cp .env.example .env.local
# Edit .env.local with your keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Requires Node.js ≥ 20.9** (see `.nvmrc` in repo root).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WHATSAPP` | Yes | WhatsApp number (digits only, e.g. `6591329303`) |
| `RESEND_API_KEY` | For email | Resend API key — sends leads to ln@ulisse.tech |
| `RESEND_FROM` | Optional | Verified sender address in Resend |
| `NEXT_PUBLIC_FORM_ENDPOINT` | Fallback | Formspree URL if Resend is not configured |
| `NEXT_PUBLIC_META_PIXEL_ID` | For ads | Meta Pixel ID |
| `NEXT_PUBLIC_GA_ID` | Optional | Google Analytics 4 measurement ID |
| `NEXT_PUBLIC_IG_URL` | Optional | Instagram profile URL |
| `NEXT_PUBLIC_FB_URL` | Optional | Facebook page URL |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical URL (default: `https://host.tiramisusg.com`) |

## Deploy on Vercel

This ships with the main **tiramisusg.com** Vercel project. Root `vercel.json` runs `scripts/build-site.sh`, which:

1. Static-exports this Next.js app into `app/dist/host/`
2. Builds the Vite marketing app into `app/dist/`
3. Deploys both together

Set env vars in the Vercel dashboard (project root). Lead API lives at `/api/lead` (repo `api/lead.ts`).

## Replace placeholder images

Drop production assets into `public/`:

| File | Usage |
|------|-------|
| `hero-fridge.jpg` | Hero — branded smart fridge in upscale lobby (1400×900+ recommended) |
| `og-host.jpg` | Social share preview (1200×630) |
| `favicon.ico` | Browser tab icon |

Product card images can replace the gradient placeholders in `src/components/ProductRange.tsx`.

## Lead flow

1. Form validates client-side, includes honeypot field.
2. `POST /api/lead` rate-limits by IP (5 req/min).
3. Sends email via **Resend** if `RESEND_API_KEY` is set; otherwise falls back to **Formspree** via `NEXT_PUBLIC_FORM_ENDPOINT`.
4. On success: Meta Pixel `Lead` event + GA4 `generate_lead`.

## Tracking events

| Action | Meta Pixel | GA4 |
|--------|------------|-----|
| Page load | `PageView` | page view |
| Calculator CTA click | `InitiateCheckout` (custom) | `begin_checkout` |
| Form submit | `Lead` | `generate_lead` |
