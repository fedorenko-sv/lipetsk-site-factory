import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
const api = readJson("contracts/openapi.json");
const siteSchema = readJson("contracts/site-config.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

assert.equal(api.openapi, "3.1.0");
assert.equal(api.info.version, "1.0.0");
assert.deepEqual(Object.keys(api.paths), ["/api/leads"]);
const operation = api.paths["/api/leads"].post;
assert.equal(operation.operationId, "createLead");
assert.ok(operation.parameters.some((p) => p.name === "Idempotency-Key" && p.required));

function rewriteRefs(value) {
  if (Array.isArray(value)) return value.map(rewriteRefs);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      key === "$ref" ? entry.replace("#/components/schemas/", "#/$defs/") : rewriteRefs(entry),
    ]));
  }
  return value;
}

let refs = 0;
function verifyRefs(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string") {
    assert.ok(value.$ref.startsWith("#/"), "Only internal refs are allowed in the API contract");
    let resolved = api;
    for (const token of value.$ref.slice(2).split("/")) {
      resolved = resolved?.[token.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    assert.notEqual(resolved, undefined, "Unresolved ref: " + value.$ref);
    refs++;
  }
  for (const item of Object.values(value)) verifyRefs(item);
}
verifyRefs(api);

const apiValidators = Object.fromEntries(Object.keys(api.components.schemas).map((name) => [
  name, ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: rewriteRefs(api.components.schemas),
    $ref: "#/$defs/" + name,
  }),
]));
const validateSite = ajv.compile(siteSchema);
function valid(validator, input, label) {
  assert.equal(validator(input), true, label + ": " + JSON.stringify(validator.errors));
}
function invalid(validator, input, label) {
  assert.equal(validator(input), false, "Unexpectedly accepted " + label);
}

const auto = readJson("examples/sites/auto.json");
const beauty = readJson("examples/sites/beauty.json");
for (const config of [auto, beauty]) {
  valid(validateSite, config, config.id);
  assert.equal(new Set(config.services.map((s) => s.id)).size, config.services.length);
  assert.equal(new Set(config.resources.map((r) => r.id)).size, config.resources.length);
  const resources = new Set(config.resources.map((r) => r.id));
  for (const service of config.services) {
    for (const resource of service.resourceIds) assert.ok(resources.has(resource), "Unknown resource");
    assert.equal(new Set(service.options.map((o) => o.id)).size, service.options.length);
  }
  assert.ok(config.booking.workingHours.opens < config.booking.workingHours.closes);
  assert.equal(config.legal.policyPath, "/demo/" + config.id + "/privacy");
  assert.equal(config.mode, "demo");
  assert.equal(config.legal.approved, false);
}
const request = readJson("examples/http/booking-request.json");
valid(apiValidators.LeadCreateRequest, request, "booking request");
valid(apiValidators.LeadReceipt, readJson("examples/http/created-response.json"), "receipt");
valid(apiValidators.ErrorEnvelope, readJson("examples/http/validation-response.json"), "error");
assert.equal(request.configVersion, auto.contentVersion);
assert.equal(request.consent.version, auto.legal.consentVersion);
assert.equal(request.customer.phone, "+70000000000");
assert.deepEqual(operation.requestBody.content["application/json"].example, request);
const service = auto.services.find((s) => s.id === request.serviceId);
assert.ok(service);
for (const option of service.options) {
  assert.ok(option.values.includes(request.serviceOptions[option.id]), "Example option is not configured");
}
const clone = (input) => JSON.parse(JSON.stringify(input));
const unknownPrice = { ...request, price: 1 };
invalid(apiValidators.LeadCreateRequest, unknownPrice, "client supplied price");
const falseConsent = clone(request);
falseConsent.consent.accepted = false;
invalid(apiValidators.LeadCreateRequest, falseConsent, "unchecked consent");
const noPhone = clone(request);
delete noPhone.customer.phone;
invalid(apiValidators.LeadCreateRequest, noPhone, "missing phone");
const badDate = clone(request);
badDate.preferred.date = "2026-02-30";
invalid(apiValidators.LeadCreateRequest, badDate, "impossible calendar date");
const wrongZone = clone(request);
wrongZone.preferred.timezone = "UTC";
invalid(apiValidators.LeadCreateRequest, wrongZone, "wrong timezone");
const honeypot = clone(request);
honeypot.antiBot.website = "spam";
invalid(apiValidators.LeadCreateRequest, honeypot, "honeypot");
invalid(apiValidators.LeadReceipt, { ...readJson("examples/http/created-response.json"), phone: "private" }, "PII in receipt");
invalid(validateSite, { ...auto, leadDestination: "private" }, "destination in public config");

const markdown = [];
function collect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "work", ".worktrees"].includes(item.name)) continue;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) collect(full);
    else if (item.name.endsWith(".md")) markdown.push(full);
  }
}
collect(root);
let links = 0;
for (const file of markdown) {
  const text = readFileSync(file, "utf8");
  assert.ok(!/\b(?:TBD|TODO|IMPLEMENT_ME)\b/.test(text), "Unresolved marker in " + file);
  for (const match of text.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const relative = decodeURIComponent(target.split("#")[0]);
    const resolved = path.resolve(path.dirname(file), relative);
    assert.ok(resolved.startsWith(root + path.sep), "Link leaves repository: " + target);
    assert.ok(existsSync(resolved), "Broken local link in " + file + ": " + target);
    links++;
  }
}
for (const name of ["agent-1-frontend", "agent-2-backend", "architect"]) {
  assert.ok(existsSync(path.join(root, "agents", name + ".md")));
}
console.log("Contract fixtures: 5 valid, 8 rejected.");
console.log("OpenAPI internal refs: " + refs + "; Markdown files: " + markdown.length + "; local links: " + links + ".");
console.log("Architecture consistency checks passed. Business acceptance is not implemented yet.");
