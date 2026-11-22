import { brandShells, type BrandConfig, type BrandShell } from "./types.ts";
import { validateBrand } from "./validate.ts";
import { prototypes } from "../features/prototypes/catalog.ts";
import mira from "./configs/mira.json" with { type: "json" };
import vecher from "./configs/vecher.json" with { type: "json" };
import prosvet from "./configs/prosvet.json" with { type: "json" };
import teplo from "./configs/teplo.json" with { type: "json" };

/**
 * Registered brands. Adding a client = one JSON file in ./configs + one line here + files in
 * public/demo-assets/brands/<key>/. Invalid configs fail the build (and `npm run check:brands`).
 */
const sources: readonly unknown[] = [mira, vecher, prosvet, teplo];

/** First brand of a shell is its default (what the factory showcase and an unset DEMO_BRAND_KEY show). */
export const defaultBrandKeys: Partial<Record<BrandShell, string>> = { beauty: "mira", estimate: "prosvet" };

function load(): ReadonlyMap<string, BrandConfig> {
  const map = new Map<string, BrandConfig>();
  for (const source of sources) {
    const result = validateBrand(source);
    if (!result.ok) throw new Error("Invalid brand config: " + result.issues.map(i => `${i.path}: ${i.message}`).join("; "));
    if (map.has(result.brand.key)) throw new Error("Duplicate brand key " + result.brand.key);
    map.set(result.brand.key, result.brand);
  }
  for (const [shell, key] of Object.entries(defaultBrandKeys)) {
    if (map.get(key)?.shell !== shell) throw new Error(`Default brand ${key} does not belong to ${shell}`);
  }
  return map;
}
const registry = load();

/**
 * Shells without a registered brand keep their historical identity: name from the catalogue,
 * colours and type from the shell preset in styles.css. This is the migration fallback.
 */
function presetBrand(shell: BrandShell): BrandConfig {
  const p = prototypes.find(item => item.id === shell)!;
  return { schemaVersion: "brand/1", key: shell + "-preset", version: "preset", shell, synthetic: true, name: { short: p.brand, full: p.brand }, scheme: shell === "auto" ? "dark" : "light", metadata: { description: p.summary } };
}

export function getBrand(key: string): BrandConfig | undefined {
  return typeof key === "string" && registry.has(key) ? registry.get(key) : undefined;
}
export function listBrands(): BrandConfig[] { return [...registry.values()]; }
export function brandsForShell(shell: BrandShell): BrandConfig[] { return listBrands().filter(b => b.shell === shell); }
export function defaultBrand(shell: BrandShell): BrandConfig {
  const key = defaultBrandKeys[shell];
  return (key && registry.get(key)) || presetBrand(shell);
}
export function isBrandShell(value: string): value is BrandShell { return (brandShells as readonly string[]).includes(value); }
