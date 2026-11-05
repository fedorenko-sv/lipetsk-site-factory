import type { SiteConfig } from "../../shared/contracts.ts";
import { autoConfig } from "./auto.ts";
import { beautyConfig } from "./beauty.ts";

const configs: Record<string, SiteConfig> = {
  auto: autoConfig,
  beauty: beautyConfig,
};

export function getSiteConfig(siteKey: string): SiteConfig | null {
  return configs[siteKey] ?? null;
}

export function getAllSiteKeys(): string[] {
  return Object.keys(configs);
}
