// Lista de resultados: formato, texto, hora, copiar y, en EAN/UPC, enlace a Open Food Facts.
import type { BarcodeFormat } from "@qhago/scanner";

const PRODUCT_FORMATS: readonly BarcodeFormat[] = ["ean_13", "ean_8", "upc_a", "upc_e"];
/** El mismo texto no se repite antes de este tiempo (al volver a enfocar el mismo código). */
const DEDUPE_MS = 3000;

const LABELS: Partial<Record<BarcodeFormat, string>> = {
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  qr_code: "QR",
  data_matrix: "Data Matrix",
  pdf417: "PDF417",
  aztec: "Aztec",
  itf: "ITF",
  codabar: "Codabar",
};

export class Results {
  readonly #last = new Map<string, number>();

  constructor(
    private readonly list: HTMLOListElement,
    private readonly empty: HTMLElement,
  ) {}

  /** Añade un resultado. Devuelve false si es un duplicado reciente. */
  add(r: { format: BarcodeFormat; text: string }, source: string): boolean {
    const now = Date.now();
    const key = `${r.format}:${r.text}`;
    const prev = this.#last.get(key);
    this.#last.set(key, now);
    if (prev !== undefined && now - prev < DEDUPE_MS) return false;

    const li = document.createElement("li");
    li.className = "result";

    const head = document.createElement("div");
    head.className = "result-head";
    const fmt = document.createElement("span");
    fmt.className = "result-format";
    fmt.textContent = LABELS[r.format] ?? r.format;
    const meta = document.createElement("span");
    meta.className = "result-meta";
    meta.textContent = `${new Date(now).toLocaleTimeString()} · ${source}`;
    head.append(fmt, meta);

    const text = document.createElement("code");
    text.className = "result-text";
    text.textContent = r.text;

    const actions = document.createElement("div");
    actions.className = "result-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copiar";
    copy.setAttribute("aria-label", `Copiar ${r.text}`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(r.text);
        copy.textContent = "Copiado";
      } catch {
        copy.textContent = "No se pudo copiar";
      }
      setTimeout(() => {
        copy.textContent = "Copiar";
      }, 1500);
    });
    actions.append(copy);
    if (PRODUCT_FORMATS.includes(r.format) && /^\d+$/.test(r.text)) {
      const a = document.createElement("a");
      a.href = `https://world.openfoodfacts.org/product/${r.text}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Buscar producto";
      actions.append(a);
    }

    li.append(head, text, actions);
    this.list.prepend(li);
    this.empty.hidden = true;
    return true;
  }

  clear(): void {
    this.list.replaceChildren();
    this.#last.clear();
    this.empty.hidden = false;
  }
}
