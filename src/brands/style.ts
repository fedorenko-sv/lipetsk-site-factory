import type { CSSProperties } from "react";
import type { BrandAsset, BrandConfig } from "./types.ts";
import { fontCatalog } from "./fonts.ts";

/** Layer 2 (roles) as custom properties on the shell root. styles.css bridges them to --p-* and form tokens. */
export function brandRootProps(brand: BrandConfig): { "data-brand": string; "data-brand-palette"?: ""; "data-brand-type"?: ""; style?: CSSProperties } {
  const vars: Record<string, string> = {};
  const p = brand.palette;
  if (p) {
    Object.assign(vars, {
      "--brand-canvas": p.canvas, "--brand-surface": p.surface, "--brand-raised": p.raised,
      "--brand-ink": p.ink, "--brand-muted": p.muted, "--brand-line": p.line,
      "--brand-accent": p.accent, "--brand-on-accent": p.onAccent, "--brand-focus": p.focus,
      "--brand-danger": p.danger, "--brand-success": p.success, "--brand-scheme": brand.scheme,
    });
  }
  const t = brand.typography;
  if (t) {
    Object.assign(vars, {
      "--brand-font-display": fontCatalog[t.display.family].stack, "--brand-display-weight": String(t.display.weight),
      "--brand-display-tracking": (t.display.tracking ?? -0.04) + "em",
      "--brand-font-body": fontCatalog[t.body.family].stack, "--brand-body-weight": String(t.body.weight),
    });
  }
  return {
    "data-brand": brand.key,
    ...(p ? { "data-brand-palette": "" as const } : {}),
    ...(t ? { "data-brand-type": "" as const } : {}),
    ...(Object.keys(vars).length ? { style: vars as CSSProperties } : {}),
  };
}

/** Logo for the brand's own background; undefined → text wordmark fallback. */
export function brandLogo(brand: BrandConfig): BrandAsset | undefined {
  return brand.scheme === "dark" ? brand.logo?.onDark : brand.logo?.onLight;
}
