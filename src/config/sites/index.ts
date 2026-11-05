import type { SiteConfig } from "../../shared/contracts.ts";
import { autoConfig } from "./auto.ts";
import { beautyConfig } from "./beauty.ts";

const configs: Record<string, SiteConfig> = Object.create(null);
configs.auto = autoConfig;
configs.beauty = beautyConfig;

export function getSiteConfig(siteKey: string): SiteConfig | null {
  if (typeof siteKey !== "string" || !Object.hasOwn(configs, siteKey)) {
    return null;
  }
  const config = configs[siteKey];
  if (!config || typeof config !== "object" || !config.hero || !Array.isArray(config.services)) {
    return null;
  }
  return config;
}

export function getAllSiteKeys(): string[] {
  return Object.keys(configs);
}
