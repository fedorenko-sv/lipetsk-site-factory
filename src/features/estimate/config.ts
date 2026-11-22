import raw from "../../../examples/calculators/estimate.json" with { type: "json" };
import type { EstimateSiteConfig } from "../../shared/estimate-contracts.ts";
export const estimateConfig = raw as EstimateSiteConfig;
