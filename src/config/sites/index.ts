import type { SiteConfig } from "../../shared/contracts.ts";
import { autoConfig } from "./auto.ts";
import { beautyConfig } from "./beauty.ts";

import medical from "../../../examples/sites/medical.json" with { type: "json" };
import sports from "../../../examples/sites/sports.json" with { type: "json" };
import stay from "../../../examples/sites/stay.json" with { type: "json" };

const configs: Record<string, SiteConfig> = Object.create(null);
configs.auto = autoConfig;
configs.beauty = beautyConfig;
configs.medical = medical as SiteConfig;
configs.sports = sports as SiteConfig;
configs.stay = stay as SiteConfig;

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
