"use client";

import { useState, type FormEvent } from "react";
import { ScrollReveal } from "./ScrollReveal";
import { GoldDivider } from "./GoldDivider";

const BUILDING_TYPES = [
  "Condo",
  "Office",
  "Hotel",
  "Gym",
  "Serviced Apartment",
  "Retail",
  "Other",
] as const;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function trackLead() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "Lead");
  }
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "generate_lead", { event_category: "host" });
  }
}

export function LeadForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot
    if (data.get("website")) {
      setStatus("success");
      return;
    }

    const payload = {
      buildingName: data.get("buildingName"),
      location: data.get("location"),
      buildingType: data.get("buildingType"),
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      message: data.get("message") || "",
    };

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }

      trackLead();
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <section id="lead-form" className="bg-navy py-16 sm:py-24">
        <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
          <div className="rounded-sm border border-gold/40 bg-navy-light p-10">
            <p className="font-serif text-2xl text-cream">Grazie!</p>
            <p className="mt-4 text-cream/80">
              Thanks — Chef Luca will be in touch within 1 business day.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="lead-form" className="bg-navy py-16 sm:py-24">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="text-center text-xs uppercase tracking-[0.25em] text-gold">Get started</p>
          <h2 className="mt-3 text-center font-serif text-3xl text-cream sm:text-4xl">
            Become a Host Partner
          </h2>
          <GoldDivider className="mx-auto mt-6 max-w-xs" />

          <form onSubmit={handleSubmit} className="mt-10 space-y-5" noValidate>
            {/* Honeypot — hidden from users */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              aria-hidden="true"
            />

            <div>
              <label htmlFor="buildingName" className="block text-sm text-cream/80">
                Building / company name <span className="text-gold">*</span>
              </label>
              <input
                id="buildingName"
                name="buildingName"
                type="text"
                required
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="Marina Bay Residences"
              />
            </div>

            <div>
              <label htmlFor="location" className="block text-sm text-cream/80">
                Location or postal code <span className="text-gold">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="018956"
              />
            </div>

            <div>
              <label htmlFor="buildingType" className="block text-sm text-cream/80">
                Building type <span className="text-gold">*</span>
              </label>
              <select
                id="buildingType"
                name="buildingType"
                required
                defaultValue=""
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="" disabled>
                  Select type
                </option>
                {BUILDING_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-navy">
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm text-cream/80">
                Your name <span className="text-gold">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm text-cream/80">
                Email <span className="text-gold">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm text-cream/80">
                Phone / WhatsApp <span className="text-gold">*</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                className="mt-1 w-full rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="+65"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm text-cream/80">
                Message <span className="text-cream/50">(optional)</span>
              </label>
              <textarea
                id="message"
                name="message"
                rows={3}
                className="mt-1 w-full resize-none rounded-sm border border-gold/30 bg-navy-light px-4 py-3 text-cream placeholder-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="Tell us about your building..."
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-300" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-sm bg-pistachio py-3.5 text-base font-medium text-white transition-all hover:bg-pistachio-dark disabled:opacity-60"
            >
              {status === "submitting" ? "Sending..." : "Submit enquiry"}
            </button>
          </form>
        </ScrollReveal>
      </div>
    </section>
  );
}
