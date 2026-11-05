/** Shared batch contract. JSON schemas remain authoritative for runtime validation. */
export type SiteMode = "demo" | "live";
export type SiteTheme = "technical" | "editorial";

export interface ServicePrice {
  kind: "fixed" | "from";
  amountMinor: number;
  currency: "RUB";
}

export interface ServiceOption {
  id: string;
  label: string;
  required: boolean;
  values: string[];
}

export interface SiteService {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: ServicePrice;
  resourceIds: string[];
  options: ServiceOption[];
}

export interface SiteResource {
  id: string;
  name: string;
}

export interface SiteConfig {
  schemaVersion: "1.0.0";
  id: string;
  contentVersion: string;
  mode: SiteMode;
  core: "booking";
  theme: SiteTheme;
  locale: "ru-RU";
  timezone: "Europe/Moscow";
  brandName: string;
  hero: { eyebrow: string; title: string; subtitle: string; ctaText: string };
  contacts: { phone?: string; messengerUrl?: string };
  address: string;
  priceDisclaimer: string;
  services: SiteService[];
  resources: SiteResource[];
  booking: {
    resourceSelection: "hidden" | "optional" | "required";
    preferenceRequired: boolean;
    horizonDays: number;
    timeStepMinutes: 15 | 30 | 60;
    workingHours: { opens: string; closes: string; days: number[] };
  };
  legal: {
    consentVersion: string;
    policyPath: string;
    operatorName: string | null;
    approved: boolean;
  };
}

export interface TimePreference {
  date: string;
  time: string;
  timezone: "Europe/Moscow";
}

export interface LeadCreateRequest {
  siteKey: string;
  configVersion: string;
  kind: "booking";
  serviceId: string;
  serviceOptions: Record<string, string>;
  resourceId?: string;
  preferred?: TimePreference;
  customer: { phone: string; name?: string };
  consent: { accepted: true; version: string };
  attribution?: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
  antiBot: { website: "" };
}

export interface LeadReceipt {
  leadId: string;
  status: "received";
  replayed: boolean;
  message: string;
}

export type ApiErrorCode =
  | "INVALID_JSON"
  | "IDEMPOTENCY_REQUIRED"
  | "ORIGIN_NOT_ALLOWED"
  | "SITE_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "CONFIG_CHANGED"
  | "CONSENT_CHANGED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_FAILED"
  | "REQUEST_REJECTED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "STORAGE_UNAVAILABLE"
  | "DEMO_NOT_READY"
  | "LIVE_NOT_READY";

export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string>;
  };
}
