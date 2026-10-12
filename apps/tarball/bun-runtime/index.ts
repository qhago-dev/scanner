// Bun: decode() de un PNG en runtime (y del mismo código empaquetado con `bun build --target bun`).
import { decode } from "@qhago/scanner";

const bytes = new Uint8Array(await Bun.file(process.argv[2] ?? "fixture.png").arrayBuffer());
const r = await decode(bytes);
console.log(`RESULT:${r.map((x) => x.text).join(",")}`);
