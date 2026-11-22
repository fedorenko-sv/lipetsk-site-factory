import type { LeadCreateRequest } from "./contracts.ts";
export interface WindowParameters {
    product: "window" | "balcony-door";
    widthMm: number;
    heightMm: number;
    quantity: number;
    glazing: "double" | "triple";
    finish: "white" | "graphite";
    installation: boolean;
}
export interface WindowRates {
    frameRateMinor: number;
    doorRateMinor: number;
    tripleExtraMinor: number;
    graphitePercent: number;
    installationMinorEach: number;
}
export interface EstimateQuote {
    formulaVersion: string;
    currency: "RUB";
    totalMinor: number;
    breakdown: {
        code: string;
        label: string;
        amountMinor: number;
    }[];
    assumptions: string[];
}
export interface EstimateSiteConfig {
    schemaVersion: "1.0.0";
    id: "estimate";
    mode: "demo";
    core: "calculator";
    contentVersion: string;
    formulaVersion: string;
    brandName: string;
    rates: WindowRates;
    legal: {
        consentVersion: string;
        policyPath: string;
        approved: false;
        operatorName: null;
    };
}
export interface EstimateLeadRequest extends Pick<LeadCreateRequest, "siteKey" | "configVersion" | "customer" | "consent" | "antiBot"> {
    kind: "estimate";
    parameters: WindowParameters;
}
