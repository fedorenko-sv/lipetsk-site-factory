// Keep previous cinematic previews available while this complete site uses its own port.
const raw = process.env.PORTFOLIO_PREVIEW_PORT || process.env.DETAILING_PREVIEW_PORT || "3035";
if (!/^\d{4,5}$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
  throw new Error("DETAILING_PREVIEW_PORT must be a local TCP port (1024–65535)");
}
export const port = Number(raw);
export const base = "http://127.0.0.1:" + port;
export const database = "lsf_test_detailing_preview_" + port;
