import { connection } from "next/server";
import type { BrandConfig, BrandShell } from "./types.ts";
import { brandFor, resolveBrandSelection } from "./select.ts";
import { brandsForShell, defaultBrand } from "./registry.ts";
import { parseDemoDeployment } from "../server/config/demo-deployment.ts";

/**
 * Resolve the shell's brand before the first byte is rendered (no theme flash, no SSR mismatch).
 * Shells with a single registered identity stay static; shells with alternatives read DEMO_BRAND_KEY
 * per request, so one build can serve several brands from separate preview processes.
 * An invalid selection never reaches here in a profile run: the proxy answers 503 first. In any other
 * path it falls back to the shell default deterministically.
 */
export async function getShellBrand(shell: BrandShell): Promise<BrandConfig> {
  if (brandsForShell(shell).length < 2) return defaultBrand(shell);
  await connection();
  return brandFor(shell, resolveBrandSelection(process.env.DEMO_BRAND_KEY, parseDemoDeployment(process.env.DEMO_SITE_KEY)));
}
