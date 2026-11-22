import type { Metadata } from "next";
import { getShellBrand } from "./server.ts";
import { isBrandShell } from "./registry.ts";

/** Tab title and description from the active brand; unknown keys keep the existing not-found titles. */
export async function brandMetadata(siteKey: string, prefix: string | null, description?: string): Promise<Metadata> {
  if (!isBrandShell(siteKey)) return { title: "Сайт не найден", robots: { index: false, follow: false } };
  const brand = await getShellBrand(siteKey);
  return {
    title: prefix ? prefix + " · " + brand.name.short : brand.name.full,
    description: description ?? brand.metadata?.description,
    robots: { index: false, follow: false },
  };
}
