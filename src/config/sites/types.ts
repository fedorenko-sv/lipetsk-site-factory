export interface ServiceOption {
  id: string;
  label: string;
  required: boolean;
  values: string[];
}

export interface ServicePrice {
  kind: "fixed" | "from" | "range";
  amountMinor: number;
  amountMinorMax?: number;
  currency: string;
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
  role: string;
}

export interface SiteHero {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaText: string;
}

export interface SiteWorkingHours {
  opens: string;
  closes: string;
  days: number[];
}

export interface SiteBookingConfig {
  resourceSelection: "hidden" | "optional" | "required";
  preferenceRequired: boolean;
  horizonDays: number;
  timeStepMinutes: number;
  workingHours: SiteWorkingHours;
}

export interface SiteLegalConfig {
  consentVersion: string;
  policyPath: string;
  operatorName: string | null;
  approved: boolean;
}

export interface SiteConfig {
  schemaVersion: "1.0.0";
  id: string;
  contentVersion: string;
  mode: "demo" | "live";
  core: "booking";
  theme: "technical" | "editorial";
  locale: string;
  timezone: string;
  brandName: string;
  hero: SiteHero;
  contacts: Record<string, string>;
  address: string;
  priceDisclaimer: string;
  services: SiteService[];
  resources: SiteResource[];
  booking: SiteBookingConfig;
  legal: SiteLegalConfig;
}

