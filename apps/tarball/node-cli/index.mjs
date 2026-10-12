// Node 22+: decode() de un JPEG desde disco.
import { readFile } from "node:fs/promises";
import { decode } from "@qhago/scanner";

const r = await decode(await readFile(process.argv[2] ?? "fixture.jpg"));
console.log(`RESULT:${r.map((x) => x.text).join(",")}`);
