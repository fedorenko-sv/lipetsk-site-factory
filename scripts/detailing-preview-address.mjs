// The V1 preview can keep serving 3032 while the new worktree serves 3033.
const raw = process.env.DETAILING_PREVIEW_PORT || "3033";
if (!/^\d{4,5}$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
  throw new Error("DETAILING_PREVIEW_PORT must be a local TCP port (1024–65535)");
}
export const port = Number(raw);
export const base = "http://127.0.0.1:" + port;
export const database = "lsf_test_detailing_preview_" + port;
