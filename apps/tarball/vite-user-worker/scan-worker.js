import { decode } from "@qhago/scanner";

self.onmessage = async (e) => {
  try {
    const r = await decode(e.data);
    self.postMessage(r.map((x) => x.text).join(","));
  } catch (err) {
    self.postMessage(`ERR:${err?.message ?? err}`);
  }
};
