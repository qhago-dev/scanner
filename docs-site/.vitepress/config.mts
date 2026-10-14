import { defineConfig } from "vitepress";

// Se publica en https://qhago.dev/docs/ (ScanError.docsUrl apunta a /docs/errors#<código>).
export default defineConfig({
  lang: "es",
  title: "Qhago Scanner",
  description:
    "Lectura de códigos de barras y QR en navegador, Node y Bun (ZXing-C++ en WebAssembly).",
  base: process.env.DOCS_BASE ?? "/docs/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Guía", link: "/inicio" },
      { text: "API", link: "/api/" },
      { text: "Benchmark", link: "/benchmark" },
      { text: "Errores", link: "/errors" },
      // F11: demo pública (showcase/), servida junto a las docs en /demo/ (pages.yml pasa la URL real).
      { text: "Demo", link: process.env.DEMO_URL ?? "https://qhago.dev/demo/" },
    ],
    sidebar: [
      { text: "Empezar", items: [{ text: "Inicio rápido", link: "/inicio" }] },
      {
        text: "Guías",
        items: [
          { text: "Cámara (permisos, HTTPS, iOS)", link: "/guia/camara" },
          { text: "Rendimiento, ROI y multi-código", link: "/guia/rendimiento" },
          { text: "Escanear archivos", link: "/guia/archivos" },
          { text: "Componente <qhago-scanner>", link: "/guia/ui" },
          { text: "Polyfill de BarcodeDetector", link: "/guia/polyfill" },
          { text: "Migrar desde Quagga2", link: "/guia/quagga" },
          { text: "Parsers (GS1, QR, AAMVA)", link: "/guia/parsers" },
          { text: "Bundlers, CDN, CSP y self-hosting", link: "/guia/bundlers" },
          { text: "Frameworks", link: "/guia/frameworks" },
          { text: "Escáner para tiendas", link: "/guia/tienda" },
        ],
      },
      {
        text: "Referencia",
        items: [
          { text: "API (TypeDoc)", link: "/api/" },
          { text: "Errores y solución de problemas", link: "/errors" },
          { text: "Benchmark y metodología", link: "/benchmark" },
          { text: "Soporte y versiones", link: "/soporte" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { label: "En esta página" },
    docFooter: { prev: "Anterior", next: "Siguiente" },
  },
});
