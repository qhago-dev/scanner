# Soporte: plataformas y versiones

## Plataformas

La tabla de plataformas soportadas vive en el [README del roadmap](https://github.com/qhago-dev/scanner/blob/master/docs/roadmap-v1/README.md#plataformas-soportadas-fuente-única-el-resto-de-documentos-remiten-aquí)
(fuente única). Resumen: Chrome/Edge y Samsung Internet (últimas 2), Firefox (últimas 2 + ESR), Safari ≥ 16.4
(macOS/iOS), Node ≥ 22.12, Bun ≥ 1.2; Deno en modo best effort. `createScanner()` (cámara) solo en navegador.

## Versionado

- [SemVer](https://semver.org/lang/es/) desde 1.0.0. La API pública es la de `packages/scanner/api/public-api.md`
  (cambios revisados en CI).
- **Mayor**: cambios incompatibles de la API pública o subida del mínimo de una plataforma.
- **Menor**: funciones nuevas compatibles, formatos nuevos, opciones nuevas (las experimentales se marcan como tales).
- **Parche**: correcciones; también cambios del motor que **reduzcan** lecturas falsas aunque cambien resultados.
- Las opciones `advanced.*` marcadas como experimentales pueden cambiar en una versión menor.

## Deprecaciones

Una API se marca `@deprecated` (JSDoc + aviso en consola una vez) al menos una versión menor antes de retirarse en la
siguiente mayor, con la alternativa en el CHANGELOG.

## Pre-releases

Canales `alpha` → `beta` → `rc` → `latest` (ver la política de dist-tags del roadmap). Solo la última pre-release de
cada canal recibe correcciones.
