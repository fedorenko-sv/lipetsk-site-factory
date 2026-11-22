import type { FontFamilyKey } from "./types.ts";

/**
 * Allowed typefaces. Each local family points at self-hosted WOFF2 files with an OFL licence
 * (public/demo-assets/detailing/fonts). A brand can only reference keys from this catalogue.
 * Adding a family = WOFF2 + licence + @font-face + one entry here.
 */
export const fontCatalog: Record<FontFamilyKey, { stack: string; weights: readonly number[]; cyrillic: boolean }> = {
  "oblik-sans": { stack: '"Oblik Sans", "Segoe UI", Arial, sans-serif', weights: [400, 500, 600], cyrillic: true },
  "oblik-serif": { stack: '"Oblik Serif", Georgia, "Times New Roman", serif', weights: [400], cyrillic: true },
  "system-sans": { stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', weights: [400, 500, 600, 700], cyrillic: true },
  "system-serif": { stack: 'Georgia, "Times New Roman", serif', weights: [400, 700], cyrillic: true },
};
