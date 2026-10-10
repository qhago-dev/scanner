// Servidor de pruebas en dispositivo: sirve dist/ y recibe logs + fotogramas de la demo (modo depuración).
// Uso: bun run build && bun debug-server.ts [puerto]   → abre la URL con ?debug=<token> que imprime.
// Las capturas quedan en debug-captures/<sesión>/ (gitignored); nunca salen de esta máquina.
import { appendFile, mkdir } from "node:fs/promises";
import { join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "dist");
const OUT = join(import.meta.dir, "debug-captures");
const PORT = Number(process.argv[2] ?? 4730);
const TOKEN = process.env.DEBUG_TOKEN ?? crypto.randomUUID().slice(0, 8);
const MAX = 8 * 1024 * 1024;
const SID = /^[\w-]{1,64}$/;

async function save(req: Request, url: URL): Promise<Response> {
  if (req.headers.get("x-debug-token") !== TOKEN) return new Response("token", { status: 403 });
  const sid = url.searchParams.get("sid") ?? "";
  if (!SID.test(sid)) return new Response("sid", { status: 400 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX) return new Response("grande", { status: 413 });
  const dir = join(OUT, sid);
  await mkdir(dir, { recursive: true });
  if (url.pathname === "/debug/log") {
    await appendFile(join(dir, "log.jsonl"), body);
  } else {
    const name = url.searchParams.get("name") ?? "";
    if (!/^[\w.-]{1,80}\.(jpg|png|json)$/.test(name)) return new Response("name", { status: 400 });
    await Bun.write(join(dir, name), body);
  }
  return new Response("ok");
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname.startsWith("/debug/")) return save(req, url);
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith("/")) path += "index.html";
    const file = Bun.file(join(ROOT, path));
    if (!path.startsWith("/") || path.includes("..") || !(await file.exists()))
      return new Response("404", { status: 404 });
    const type = path.endsWith(".wasm") ? "application/wasm" : file.type;
    return new Response(file, { headers: { "content-type": type, "cache-control": "no-cache" } });
  },
});
console.log(`demo en http://localhost:${PORT}/presentacion.html?debug=${TOKEN}#23`);
console.log(`capturas → ${OUT}`);
