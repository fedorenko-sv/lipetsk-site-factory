import { brandShells, type BrandConfig, type BrandPalette } from "./types.ts";
import { fontCatalog } from "./fonts.ts";

export type BrandIssue = { path: string; message: string };
type Obj = Record<string, unknown>;

const HEX = /^#[0-9a-f]{6}$/;
const KEY = /^[a-z][a-z0-9-]{1,30}$/;
const VERSION = /^\d{4}-\d{2}-\d{2}(\.\d{1,3})?$/;
const paletteKeys = ["canvas", "surface", "raised", "ink", "muted", "line", "accent", "onAccent", "focus", "danger", "success"] as const;

/** WCAG 2.x relative luminance / contrast ratio for #rrggbb. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Pairs the UI actually renders. 4.5 = text, 3 = UI components / focus indicators (WCAG 1.4.3, 1.4.11). */
export const contrastPairs: readonly [keyof BrandPalette, keyof BrandPalette, number][] = [
  ["ink", "canvas", 4.5], ["ink", "surface", 4.5], ["ink", "raised", 4.5],
  ["muted", "canvas", 4.5], ["muted", "surface", 4.5], ["muted", "raised", 4.5],
  ["onAccent", "accent", 4.5], ["accent", "canvas", 3], ["accent", "surface", 3],
  ["focus", "canvas", 3], ["focus", "surface", 3], ["focus", "raised", 3],
  ["danger", "canvas", 4.5], ["danger", "raised", 4.5], ["success", "canvas", 3],
];

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const safeText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[<>{}`\\]/.test(v);

function only(o: Obj, allowed: readonly string[], path: string, out: BrandIssue[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) out.push({ path: path + k, message: "unknown field" });
}

function checkAsset(v: unknown, path: string, key: string, shell: string, out: BrandIssue[]) {
  if (!isObj(v)) { out.push({ path, message: "must be an object" }); return; }
  only(v, ["path", "license", "width", "height", "alt"], path + ".", out);
  const p = v.path;
  const allowed = new RegExp(`^/demo-assets/(brands/${key}|editorial/${shell}|prototypes)/[a-z0-9-]+(/[a-z0-9-]+)*\\.(svg|webp|png)$`);
  if (typeof p !== "string" || !allowed.test(p)) out.push({ path: path + ".path", message: `must be a local file under /demo-assets/brands/${key}/, /demo-assets/editorial/${shell}/ or /demo-assets/prototypes/` });
  if (!safeText(v.license, 200)) out.push({ path: path + ".license", message: "licence / origin note is required" });
  for (const d of ["width", "height"] as const) {
    const n = v[d];
    if (!Number.isInteger(n) || (n as number) < 8 || (n as number) > 4000) out.push({ path: path + "." + d, message: "integer 8–4000 required" });
  }
  if (!safeText(v.alt, 160)) out.push({ path: path + ".alt", message: "meaningful alt text required" });
}

export function validateBrand(input: unknown): { ok: true; brand: BrandConfig } | { ok: false; issues: BrandIssue[] } {
  const out: BrandIssue[] = [];
  if (!isObj(input)) return { ok: false, issues: [{ path: "", message: "brand must be an object" }] };
  only(input, ["$schema", "schemaVersion", "key", "version", "shell", "synthetic", "name", "logo", "scheme", "palette", "typography", "media", "copy", "metadata"], "", out);
  if (input.schemaVersion !== "brand/1") out.push({ path: "schemaVersion", message: 'must be "brand/1"' });
  const key = typeof input.key === "string" && KEY.test(input.key) ? input.key : "";
  if (!key) out.push({ path: "key", message: "lowercase latin key, 2–31 chars" });
  if (typeof input.version !== "string" || !VERSION.test(input.version)) out.push({ path: "version", message: "YYYY-MM-DD or YYYY-MM-DD.N" });
  const shell = typeof input.shell === "string" && (brandShells as readonly string[]).includes(input.shell) ? input.shell : "";
  if (!shell) out.push({ path: "shell", message: "one of " + brandShells.join(", ") });
  if (input.synthetic !== true) out.push({ path: "synthetic", message: "only synthetic demo identities are accepted" });

  if (!isObj(input.name)) out.push({ path: "name", message: "required" });
  else {
    only(input.name, ["short", "full"], "name.", out);
    if (!safeText(input.name.short, 24)) out.push({ path: "name.short", message: "1–24 chars, no markup" });
    if (!safeText(input.name.full, 80)) out.push({ path: "name.full", message: "1–80 chars, no markup" });
  }
  if (input.scheme !== "light" && input.scheme !== "dark") out.push({ path: "scheme", message: "light or dark" });

  if (input.logo !== undefined) {
    if (!isObj(input.logo)) out.push({ path: "logo", message: "must be an object" });
    else {
      only(input.logo, ["onLight", "onDark"], "logo.", out);
      for (const v of ["onLight", "onDark"] as const) if (input.logo[v] !== undefined) checkAsset(input.logo[v], "logo." + v, key, shell, out);
    }
  }

  if (input.palette !== undefined) {
    if (!isObj(input.palette)) out.push({ path: "palette", message: "must be an object" });
    else {
      only(input.palette, paletteKeys, "palette.", out);
      const pal = input.palette as Obj;
      const bad = paletteKeys.filter(k => typeof pal[k] !== "string" || !HEX.test(pal[k] as string));
      for (const k of bad) out.push({ path: "palette." + k, message: "#rrggbb lowercase hex required" });
      if (!bad.length) {
        const p = pal as unknown as BrandPalette;
        for (const [fg, bg, min] of contrastPairs) {
          const ratio = contrast(p[fg], p[bg]);
          if (ratio < min) out.push({ path: `palette.${fg}/${bg}`, message: `contrast ${ratio.toFixed(2)} < ${min}` });
        }
        const lum = luminance(p.canvas);
        if (input.scheme === "dark" && lum > 0.2) out.push({ path: "palette.canvas", message: "dark scheme needs a dark canvas" });
        if (input.scheme === "light" && lum < 0.4) out.push({ path: "palette.canvas", message: "light scheme needs a light canvas" });
      }
    }
  }

  if (input.typography !== undefined) {
    if (!isObj(input.typography)) out.push({ path: "typography", message: "must be an object" });
    else {
      only(input.typography, ["display", "body"], "typography.", out);
      for (const role of ["display", "body"] as const) {
        const t = input.typography[role];
        if (!isObj(t)) { out.push({ path: "typography." + role, message: "required" }); continue; }
        only(t, ["family", "weight", "tracking"], `typography.${role}.`, out);
        const font = typeof t.family === "string" ? fontCatalog[t.family as keyof typeof fontCatalog] : undefined;
        if (!font) out.push({ path: `typography.${role}.family`, message: "one of " + Object.keys(fontCatalog).join(", ") });
        else if (!font.weights.includes(t.weight as number)) out.push({ path: `typography.${role}.weight`, message: "available: " + font.weights.join(", ") });
        if (t.tracking !== undefined && (typeof t.tracking !== "number" || t.tracking < -0.08 || t.tracking > 0.05)) out.push({ path: `typography.${role}.tracking`, message: "em, −0.08…0.05" });
      }
    }
  }

  if (input.media !== undefined) {
    if (!isObj(input.media)) out.push({ path: "media", message: "must be an object" });
    else { only(input.media, ["hero"], "media.", out); if (input.media.hero !== undefined) checkAsset(input.media.hero, "media.hero", key, shell, out); }
  }
  if (input.copy !== undefined) {
    if (!isObj(input.copy)) out.push({ path: "copy", message: "must be an object" });
    else {
      only(input.copy, ["kicker", "tagline", "lead"], "copy.", out);
      if (input.copy.lead !== undefined && !safeText(input.copy.lead, 260)) out.push({ path: "copy.lead", message: "≤260 chars, no markup" });
      if (input.copy.kicker !== undefined && !safeText(input.copy.kicker, 60)) out.push({ path: "copy.kicker", message: "≤60 chars, no markup" });
      if (input.copy.tagline !== undefined && !safeText(input.copy.tagline, 48)) out.push({ path: "copy.tagline", message: "≤48 chars, no markup" });
    }
  }
  if (input.metadata !== undefined) {
    if (!isObj(input.metadata)) out.push({ path: "metadata", message: "must be an object" });
    else { only(input.metadata, ["description"], "metadata.", out); if (input.metadata.description !== undefined && !safeText(input.metadata.description, 200)) out.push({ path: "metadata.description", message: "≤200 chars, no markup" }); }
  }
  return out.length ? { ok: false, issues: out } : { ok: true, brand: input as unknown as BrandConfig };
}
