import type { BrandConfig, BrandShell } from "./types.ts";
import { defaultBrand, getBrand } from "./registry.ts";
import type { DemoDeployment } from "../server/config/demo-deployment.ts";

export type BrandSelection =
  | { kind: "default" }
  | { kind: "brand"; brand: BrandConfig }
  | { kind: "invalid"; reason: "unknown" | "incompatible" | "deployment" };

/**
 * DEMO_BRAND_KEY → selection, limited to the running profile. A brand never widens the API allowlist,
 * siteKey, services or prices: it only changes what the shell looks like.
 */
export function resolveBrandSelection(value: unknown, mode: DemoDeployment): BrandSelection {
  if (value === undefined || value === "") return { kind: "default" };
  if (mode.kind === "invalid") return { kind: "invalid", reason: "deployment" };
  const brand = typeof value === "string" ? getBrand(value) : undefined;
  if (!brand) return { kind: "invalid", reason: "unknown" };
  if (mode.kind === "single" && !(mode.profile.siteKeys as readonly string[]).includes(brand.shell)) return { kind: "invalid", reason: "incompatible" };
  return { kind: "brand", brand };
}

/** The brand a shell renders. A selected brand applies only to its own shell; every other shell keeps its default. */
export function brandFor(shell: BrandShell, selection: BrandSelection): BrandConfig {
  return selection.kind === "brand" && selection.brand.shell === shell ? selection.brand : defaultBrand(shell);
}
