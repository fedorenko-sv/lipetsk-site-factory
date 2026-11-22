/**
 * Client identity for one demo shell. Data only: no CSS, HTML, URLs outside /demo-assets/, or executable strings.
 * Shell = composition, sections, scenario. Brand = what a visitor reads as "the company". Services/prices stay in SiteConfig.
 */
export const brandShells = ["auto", "beauty", "medical", "sports", "stay", "estimate"] as const;
export type BrandShell = (typeof brandShells)[number];

export const fontFamilies = ["oblik-sans", "oblik-serif", "system-sans", "system-serif"] as const;
export type FontFamilyKey = (typeof fontFamilies)[number];

/** Layer 1: raw brand values. Six-digit lowercase hex only. */
export interface BrandPalette {
  canvas: string;     // page background
  surface: string;    // bands, cards, form shell
  raised: string;     // inputs, calculator panel
  ink: string;        // main text
  muted: string;      // secondary text
  line: string;       // decorative dividers
  accent: string;     // buttons, active state
  onAccent: string;   // text on accent
  focus: string;      // focus ring
  danger: string;     // error text / invalid border
  success: string;    // receipt mark
}

export interface BrandTypeface { family: FontFamilyKey; weight: number; tracking?: number }

export interface BrandAsset { path: string; license: string; width: number; height: number; alt: string }

export interface BrandConfig {
  schemaVersion: "brand/1";
  key: string;
  version: string;                 // bump on every change; shown in diagnostics, used for rollback
  shell: BrandShell;
  synthetic: true;                 // demo identities only until a live mode is approved
  name: { short: string; full: string };
  logo?: { onLight?: BrandAsset; onDark?: BrandAsset };
  scheme: "light" | "dark";
  palette?: BrandPalette;          // omitted → shell preset colours
  typography?: { display: BrandTypeface; body: BrandTypeface };
  media?: { hero?: BrandAsset };
  copy?: { kicker?: string; tagline?: string; lead?: string };
  metadata?: { description?: string };
}
