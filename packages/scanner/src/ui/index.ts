// @qhago/scanner/ui — registra <qhago-scanner> al importarse (SSR-safe: no hace nada sin customElements).
import { QhagoScannerElement } from "./element";

export { LABELS, QhagoScannerElement, type QhagoScannerLabels } from "./element";

if (typeof customElements !== "undefined" && !customElements.get("qhago-scanner")) {
  customElements.define("qhago-scanner", QhagoScannerElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "qhago-scanner": QhagoScannerElement;
  }
}
