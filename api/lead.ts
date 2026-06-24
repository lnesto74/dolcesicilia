import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isRateLimited } from "./rateLimit";

const LEAD_EMAIL = "eyerebirth@gmail.com";

type LeadPayload = {
  buildingName?: string;
  location?: string;
  buildingType?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  website?: string;
};

function validateLead(body: LeadPayload): string | null {
  if (body.website) return null;
  if (!body.buildingName?.trim()) return "Building name is required.";
  if (!body.location?.trim()) return "Location is required.";
  if (!body.buildingType?.trim()) return "Building type is required.";
  if (!body.name?.trim()) return "Name is required.";
  if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return "A valid email is required.";
  }
  if (!body.phone?.trim()) return "Phone number is required.";
  return null;
}

function formatEmailBody(body: LeadPayload): string {
  return [
    "New Dolce Sicilia Host Partner enquiry",
    "",
    `Building: ${body.buildingName}`,
    `Location: ${body.location}`,
    `Type: ${body.buildingType}`,
    "",
    `Contact: ${body.name}`,
    `Email: ${body.email}`,
    `Phone: ${body.phone}`,
    body.message ? `\nMessage:\n${body.message}` : "",
  ].join("\n");
}

async function sendViaResend(body: LeadPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM ?? "Dolce Sicilia <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [LEAD_EMAIL],
      reply_to: body.email,
      subject: `Host enquiry: ${body.buildingName}`,
      text: formatEmailBody(body),
    }),
  });
  return res.ok;
}

async function sendViaFormspree(body: LeadPayload): Promise<boolean> {
  const endpoint = process.env.NEXT_PUBLIC_FORM_ENDPOINT ?? process.env.FORM_ENDPOINT;
  if (!endpoint) return false;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      buildingName: body.buildingName,
      location: body.location,
      buildingType: body.buildingType,
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
      _subject: `Host enquiry: ${body.buildingName}`,
    }),
  });
  return res.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : undefined) ??
    req.socket.remoteAddress ??
    "unknown";

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const body = req.body as LeadPayload;

  if (body?.website) {
    return res.status(200).json({ ok: true });
  }

  const validationError = validateLead(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    if (await sendViaResend(body)) {
      return res.status(200).json({ ok: true });
    }
    if (await sendViaFormspree(body)) {
      return res.status(200).json({ ok: true });
    }
    return res.status(503).json({ error: "Email service not configured. Please contact us directly." });
  } catch (err) {
    console.error("Lead submission error:", err);
    return res.status(500).json({ error: "Failed to send enquiry. Please try again." });
  }
}
