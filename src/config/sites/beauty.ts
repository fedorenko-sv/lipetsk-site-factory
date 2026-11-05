import beautyJson from "../../../examples/sites/beauty.json" with { type: "json" };
import type { SiteConfig } from "../../shared/contracts.ts";

export const beautyConfig = beautyJson as unknown as SiteConfig;
