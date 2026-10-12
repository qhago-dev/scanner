import { decode } from "@qhago/scanner";

(async () => {
  try {
    const blob = await (await fetch("/fixture.png")).blob();
    const r = await decode(blob);
    window.__result = r.map((x) => x.text).join(",");
  } catch (e) {
    window.__result = `ERR:${e?.message ?? e}`;
  }
})();
