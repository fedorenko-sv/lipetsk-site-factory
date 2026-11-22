import type { EstimateLeadRequest, EstimateSiteConfig } from "../../shared/estimate-contracts.ts";
import type { Clock } from "../leads/ports.ts";
import type { LeadStore, NewLeadDecision, PreparedLeadRow } from "../leads/store-port.ts";
import type { RuntimeConfig } from "../config/runtime.ts";
import type { CreateLeadResult } from "../leads/create-lead.ts";
import { checkModeReady } from "../leads/create-lead.ts";
import { normalizePhone } from "../leads/phone.ts";
import { normalizeName } from "../leads/matching.ts";
import { buildCanonical, computePayloadHmac } from "../leads/canonical.ts";
import { parseWindowParameters, quoteWindow } from "../../features/estimate/domain.ts";
export interface EstimateDeps {
    runtime: RuntimeConfig;
    store: LeadStore;
    clock: Clock;
    siteLoader: (key: string) => EstimateSiteConfig | null;
}
export async function createEstimateLead(deps: EstimateDeps, ctx: {
    idempotencyKey: string;
    clientHmac: string;
}, wire: EstimateLeadRequest): Promise<CreateLeadResult> {
    const site = deps.siteLoader(wire.siteKey);
    if (!site)
        return { kind: "error", code: "SITE_NOT_FOUND" };
    const phone = normalizePhone(wire.customer.phone, site.mode);
    if (phone === null)
        return { kind: "field-error", code: "VALIDATION_FAILED", fieldErrors: { "customer.phone": "В демо используйте +70000000000." } };
    const name = normalizeName(wire.customer.name);
    if (!name.ok)
        return { kind: "field-error", code: "VALIDATION_FAILED", fieldErrors: { "customer.name": name.error } };
    const parsed = parseWindowParameters(wire.parameters);
    if (!parsed.ok)
        return { kind: "field-error", code: "VALIDATION_FAILED", fieldErrors: parsed.fieldErrors };
    const options = Object.fromEntries(Object.entries(parsed.value).map(([key, value]) => [key, String(value)]));
    const canonical = buildCanonical({ siteKey: wire.siteKey, configVersion: wire.configVersion, kind: "estimate", serviceId: parsed.value.product, serviceOptions: options, resourceId: null, preferredIso: null, phone, name: name.name, consentVersion: wire.consent.version, attribution: null });
    const payloadHmac = computePayloadHmac(deps.runtime.payloadHmacKey, canonical);
    const destination = deps.runtime.destinations.get(site.id);
    const validateNew = (): NewLeadDecision => {
        const mode = checkModeReady(site, destination, deps.runtime);
        if (!mode.ok)
            return { ok: false, failure: { code: mode.code } };
        if (wire.configVersion !== site.contentVersion)
            return { ok: false, failure: { code: "CONFIG_CHANGED" } };
        if (wire.consent.version !== site.legal.consentVersion)
            return { ok: false, failure: { code: "CONSENT_CHANGED" } };
        if (wire.consent.accepted !== true)
            return { ok: false, failure: { code: "VALIDATION_FAILED", fieldErrors: { "consent.accepted": "Подтвердите согласие." } } };
        const quote = quoteWindow(parsed.value, site.rates, site.formulaVersion);
        const priceSnapshot = { kind: "from" as const, amountMinor: quote.totalMinor, currency: "RUB" as const, name: "Предварительный расчёт окон", durationMinutes: 0, estimate: { ...quote, parameters: parsed.value } };
        const row: PreparedLeadRow = { siteKey: site.id, configVersion: site.contentVersion, kind: "estimate", serviceId: parsed.value.product, resourceId: null, serviceOptions: options, preferredAt: null, customerPhone: phone, customerName: name.name, consentVersion: site.legal.consentVersion, consentAt: deps.clock.now(), priceSnapshot, attribution: null, payloadHmac, destinationKey: destination!.destinationKey, adapterId: destination!.adapterId, createdAt: deps.clock.now() };
        return { ok: true, row };
    };
    const result = await deps.store.submit({ siteKey: site.id, idempotencyKey: ctx.idempotencyKey, clientHmac: ctx.clientHmac, payloadHmac, clock: deps.clock, validateNew });
    if (result.kind === "created" || result.kind === "replayed")
        return { kind: result.kind, leadId: result.leadId };
    if (result.kind === "conflict")
        return { kind: "error", code: "IDEMPOTENCY_CONFLICT" };
    if (result.kind === "rate-limited")
        return { kind: "error", code: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds };
    if (result.failure.code === "VALIDATION_FAILED")
        return { kind: "field-error", code: "VALIDATION_FAILED", fieldErrors: result.failure.fieldErrors };
    return { kind: "error", code: result.failure.code };
}
