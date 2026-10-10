import { decode } from "@qhago/scanner";

try {
  const blob = await (await fetch("/fixture.png")).blob();
  const r = await decode(blob, { formats: ["ean_13"] });
  window.__result = { ok: true, text: r[0]?.text };
} catch (e) {
  window.__result = { ok: false, code: e.code, message: String(e.message) };
}
