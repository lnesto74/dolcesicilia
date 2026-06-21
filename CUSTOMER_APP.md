# Dolce Sicilia Customer Import

Upload screenshots from your phone, extract names and phone numbers with OCR, and save contacts tagged as **Dolce Sicilia Customer Base**.

## Components

| Part | Path | Purpose |
|------|------|---------|
| **Mobile app** | `mobile/` | Native camera roll picker, OCR via API, save to phone contacts |
| **Web admin** | `app/` → `/customers` | Same flow in the browser (works on mobile Safari too) |
| **API server** | `server/` | OCR processing + customer database |
| **Shared logic** | `shared/` | Phone/name parsing from OCR text |

## Quick Start

### 1. Start the API server

```bash
cd server
npm install
npm run dev
```

Runs at `http://localhost:3001`

### 2. Web admin (desktop or mobile browser)

```bash
cd app
npm install
npm run dev
```

Open **http://localhost:5173/customers**

- Tap **Select Images** and pick multiple screenshots from your camera roll
- Review extracted names and phone numbers
- **Save to Customer Base** (API database) or **Export vCard** (import into Contacts app)

### 3. Mobile app (Expo)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your iPhone/Android.

**Important for physical devices:** `localhost` won't work on your phone. Edit `mobile/app.json`:

```json
"extra": {
  "apiUrl": "http://YOUR_COMPUTER_IP:3001"
}
```

Find your IP: `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows).

## How contacts are tagged

Saved contacts include:

- **Company:** Dolce Sicilia
- **Note:** Dolce Sicilia Customer Base

This flags them in your phone's contact list as part of your customer base.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/ocr` | Upload images (`images` field, multipart), returns extracted contacts |
| GET | `/api/contacts` | List saved customer base |
| POST | `/api/contacts` | Save contacts `{ contacts: [...] }` |
| DELETE | `/api/contacts/:id` | Remove a contact |

## Tips for better OCR

- Use clear screenshots (WhatsApp contact lists, order forms, chat headers)
- Crop to the area with names and phone numbers when possible
- Review and edit names before saving — OCR may miss or misread text
