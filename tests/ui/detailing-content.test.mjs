import test from "node:test";
import assert from "node:assert/strict";
import { programs, findProgram, resolveCategory, filterPrograms, bookingHref, siteConfig } from "../../src/features/detailing/content.ts";

test("Catalog filtering is reversible and normalizes an unknown query", () => {
  const known = resolveCategory("protection");
  assert.deepEqual(filterPrograms(known).map(p => p.id).sort(), ["ceramic", "ppf-front", "ppf-full"]);
  assert.equal(resolveCategory(["protection", "restoration"]), "all");
  assert.equal(resolveCategory("not-real"), "all");
  assert.equal(filterPrograms(resolveCategory(undefined)).length, siteConfig.services.length);
});

test("Detail lookup rejects arrays, prototype names and unknown IDs", () => {
  for (const id of [undefined, ["ceramic"], "__proto__", "constructor", "../ceramic", "unknown"]) {
    assert.equal(findProgram(id), undefined);
  }
  assert.equal(findProgram("ceramic").service, siteConfig.services.find(s => s.id === "ceramic"));
});

test("Every route can transfer its configured service and price without a parallel price list", () => {
  assert.equal(new Set(programs.map(p => p.id)).size, siteConfig.services.length);
  for (const p of programs) {
    assert.equal(p.service, siteConfig.services.find(s => s.id === p.id));
    const url = new URL(bookingHref(p.id), "http://localhost");
    assert.equal(url.pathname, "/demo/detailing/booking");
    assert.equal(url.searchParams.get("service"), p.id);
    assert.equal([...url.searchParams.keys()].length, 1);
  }
  assert.equal(bookingHref("javascript:alert(1)"), "/demo/detailing/booking");
});
