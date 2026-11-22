import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validateBrand } from "../../src/brands/validate.ts";
import { brandFor, resolveBrandSelection } from "../../src/brands/select.ts";
import { brandsForShell, defaultBrand, getBrand, listBrands } from "../../src/brands/registry.ts";
import { brandLogo, brandRootProps } from "../../src/brands/style.ts";
import { parseDemoDeployment } from "../../src/server/config/demo-deployment.ts";
import { parseDemoPreviewArgs } from "../../scripts/demo-preview-options.mjs";
import vecher from "../../src/brands/configs/vecher.json" with { type: "json" };

const clone = () => structuredClone(vecher);
const issues = input => { const r = validateBrand(input); return r.ok ? [] : r.issues.map(i => i.path); };

test("BR01: every registered brand validates and each shell resolves a deterministic default", () => {
  for (const brand of listBrands()) assert.equal(validateBrand(brand).ok, true, brand.key);
  assert.equal(defaultBrand("beauty").key, "mira");
  assert.equal(defaultBrand("estimate").key, "prosvet");
  // Not migrated yet: the historical catalogue name and the shell preset colours.
  assert.equal(defaultBrand("medical").name.short, "ЯСНО");
  assert.equal(defaultBrand("medical").palette, undefined);
  assert.deepEqual(brandsForShell("beauty").map(b => b.key).sort(), ["mira", "vecher"]);
});

test("BR02: unsafe or inaccessible values are rejected with a field path", () => {
  const cases = [
    [b => { b.palette.accent = "red"; }, "palette.accent"],
    [b => { b.palette.accent = "#FFAA00"; }, "palette.accent"],
    [b => { b.palette.muted = "#3b3141"; }, "palette.muted/canvas"],
    [b => { b.palette.onAccent = "#d0a070"; }, "palette.onAccent/accent"],
    [b => { b.palette.canvas = "#fdfbf9"; }, "palette.canvas"],
    [b => { b.media.hero.path = "https://cdn.example.com/hero.webp"; }, "media.hero.path"],
    [b => { b.media.hero.path = "/demo-assets/brands/vecher/../mira/x.webp"; }, "media.hero.path"],
    [b => { b.media.hero.path = "/demo-assets/brands/mira/hero.webp"; }, "media.hero.path"],
    [b => { b.media.hero.path = "/demo-assets/editorial/auto/tread.webp"; }, "media.hero.path"],
    [b => { b.logo.onDark.alt = ""; }, "logo.onDark.alt"],
    [b => { b.logo.onDark.license = ""; }, "logo.onDark.license"],
    [b => { b.typography.display.family = "Comic Sans"; }, "typography.display.family"],
    [b => { b.typography.display.weight = 900; }, "typography.display.weight"],
    [b => { b.name.short = "<b>ВЕЧЕР</b>"; }, "name.short"],
    [b => { b.name.short = "Очень длинное название студии"; }, "name.short"],
    [b => { b.css = "body{display:none}"; }, "css"],
    [b => { b.shell = "detailing"; }, "shell"],
    [b => { b.synthetic = false; }, "synthetic"],
  ];
  for (const [mutate, path] of cases) {
    const b = clone(); mutate(b);
    assert.ok(issues(b).includes(path), path + " → " + issues(b).join(","));
  }
});

test("BR03: selection is limited to the running profile and never leaks into another shell", () => {
  const beauty = parseDemoDeployment("beauty");
  const factory = parseDemoDeployment("");
  assert.deepEqual(resolveBrandSelection(undefined, beauty), { kind: "default" });
  assert.equal(resolveBrandSelection("vecher", beauty).kind, "brand");
  assert.deepEqual(resolveBrandSelection("prosvet", beauty), { kind: "invalid", reason: "incompatible" });
  assert.deepEqual(resolveBrandSelection("nope", beauty), { kind: "invalid", reason: "unknown" });
  assert.deepEqual(resolveBrandSelection("constructor", beauty), { kind: "invalid", reason: "unknown" });
  assert.deepEqual(resolveBrandSelection("__proto__", factory), { kind: "invalid", reason: "unknown" });
  assert.deepEqual(resolveBrandSelection("vecher", parseDemoDeployment("bad")), { kind: "invalid", reason: "deployment" });
  // Factory mode: the selected brand changes its shell only.
  const sel = resolveBrandSelection("vecher", factory);
  assert.equal(brandFor("beauty", sel).key, "vecher");
  assert.equal(brandFor("estimate", sel).key, "prosvet");
  assert.equal(brandFor("medical", sel).name.short, "ЯСНО");
  assert.equal(getBrand("toString"), undefined);
});

test("BR04: root props carry only validated roles; logo follows scheme with text fallback", () => {
  const v = brandRootProps(getBrand("vecher"));
  assert.equal(v["data-brand"], "vecher");
  assert.equal(v.style["--brand-canvas"], "#17131a");
  assert.equal(v.style["--brand-scheme"], "dark");
  assert.match(v.style["--brand-font-body"], /^"Oblik Sans"/);
  assert.ok(Object.keys(v.style).every(k => k.startsWith("--brand-")));
  assert.equal(brandLogo(getBrand("vecher")).path, "/demo-assets/brands/vecher/logo-on-dark.svg");
  assert.equal(brandLogo(getBrand("mira")), undefined);
  const preset = brandRootProps(defaultBrand("sports"));
  assert.deepEqual(preset, { "data-brand": "sports-preset" });
});

test("BR05: preview CLI accepts compatible brands and explains wrong ones", () => {
  assert.deepEqual(parseDemoPreviewArgs(["beauty", "--brand", "vecher"]), { siteKey: "beauty", port: 3042, brandKey: "vecher" });
  assert.deepEqual(parseDemoPreviewArgs(["beauty", "--brand", "vecher", "--port", "3142"]), { siteKey: "beauty", port: 3142, brandKey: "vecher" });
  assert.throws(() => parseDemoPreviewArgs(["beauty", "--brand", "prosvet"]), /another shell.*mira, vecher/);
  assert.throws(() => parseDemoPreviewArgs(["beauty", "--brand", "nope"]), /Unknown brand/);
  assert.throws(() => parseDemoPreviewArgs(["beauty", "--brand"]));
  assert.throws(() => parseDemoPreviewArgs(["beauty", "--brand", "vecher", "--brand", "mira"]));
});

test("BR06: preview never inherits a brand from the operator shell", async () => {
  const { previewSettings } = await import("../../scripts/preview-runtime.mjs");
  const prev = process.env.DEMO_BRAND_KEY;
  process.env.DEMO_BRAND_KEY = "vecher";
  try {
    const plain = previewSettings({ siteKey: "beauty", port: 3042, postgresUrl: "postgresql://fixture@127.0.0.1:5432/lsf_test_fixture" });
    assert.equal(plain.env.DEMO_BRAND_KEY, "");
    const branded = previewSettings({ siteKey: "beauty", port: 3142, brandKey: "vecher", postgresUrl: "postgresql://fixture@127.0.0.1:5432/lsf_test_fixture" });
    assert.equal(branded.env.DEMO_BRAND_KEY, "vecher");
    assert.notEqual(plain.database, branded.database);
    assert.throws(() => previewSettings({ siteKey: "beauty", port: 3142, brandKey: "../x", postgresUrl: "postgresql://fixture@127.0.0.1:5432/lsf_test_fixture" }));
  } finally { if (prev === undefined) delete process.env.DEMO_BRAND_KEY; else process.env.DEMO_BRAND_KEY = prev; }
});

test("BR07: check:brands passes on the repository configs", () => {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/check-brands.mjs"], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ vecher/);
});
