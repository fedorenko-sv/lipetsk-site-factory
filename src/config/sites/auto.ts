import autoJson from "../../../examples/sites/auto.json" with { type: "json" };
import type { SiteConfig } from "../../shared/contracts.ts";

export const autoConfig = autoJson as unknown as SiteConfig;
