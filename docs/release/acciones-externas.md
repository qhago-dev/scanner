# Acciones externas pendientes (las ejecuta el autor)

Preparadas en F0.8; ninguna se ha ejecutado. Orden recomendado:

## 1. Repositorio público en GitHub (requisito de provenance)
- [ ] Revisar el historial: `git log --stat` (no hay secretos ni datos del dataset; el dataset vive en un bucket privado, ADR-12).
- [ ] Crear el repo en GitHub, añadir el remoto y hacer push de `master` (con submódulos).
- [ ] Marcarlo como público.
- [ ] Actualizar `repository.url` en `packages/*/package.json` si la URL difiere de la usada en F7.

## 2. Organización npm
- [ ] Crear la organización `qhago` en npmjs.com (scope `@qhago`).
- [ ] Activar 2FA obligatoria para publicar.

## 3. Bootstrap (una vez)
- [ ] Crear un *granular access token* con escritura sobre `@qhago`, caducidad ≤ 7 días.
- [ ] Guardarlo como secreto `NPM_BOOTSTRAP_TOKEN` del repo.
- [ ] Ejecutar el workflow **Bootstrap npm (uso único)** escribiendo `publicar`.
- [ ] Verificar: `npm view @qhago/scanner` y `npm view @qhago/ai` muestran `0.0.0` deprecado.

## 4. Trusted publishing
- [ ] En npmjs.com → cada paquete → *Settings* → *Trusted publishing*: GitHub Actions, repo, workflow `release.yml`.
- [ ] En *Publishing access*: "Require two-factor authentication and disallow tokens".
- [ ] **Borrar** el secreto `NPM_BOOTSTRAP_TOKEN` y revocar el token.

## 5. Primera pre-release (F2.9)
- [ ] Ejecutar **Release** con `dry-run: true` y revisar el resultado.
- [ ] Mergear a `master` un PR con changesets → el workflow abre "Version Packages"; al mergearlo publica en `@alpha`.

## 6. Dataset privado (F1)
- [ ] Crear el bucket (R2/S3) con acceso de solo lectura para CI.
- [ ] Guardar credenciales como secretos `BENCH_DATASET_URL` / `BENCH_DATASET_TOKEN`.

## 7. Beta (F4.8) y RC (F6.9)
- [ ] Con la API congelada (`changeset pre enter beta` ya hecho en local), mergear "Version Packages" → publica `@beta`.
- [ ] Ronda manual de la matriz de dispositivos ([docs/compatibilidad.md](../compatibilidad.md)) con la beta.
- [ ] Después: `bunx changeset pre exit && bunx changeset pre enter rc`, commit y merge → publica `@rc`.
      No se ha hecho en local para no saltarse la publicación de la beta.

## 8. Upstream ZXing-C++
- [ ] Abrir el issue de `NormalizedE2EPattern`/`LocalGrid`/`MicroPDFReader` (NaN → int) con el texto preparado en
      [packages/engine-wasm/fuzz/README.md](../../packages/engine-wasm/fuzz/README.md).

## 9. Fixtures del BarcodeDetector nativo (F4.3)
- [ ] En Chrome macOS y Chrome Android, abrir `apps/demo/diagnostics.html`, elegir las imágenes de
      `packages/scanner/test/fixtures/` y guardar los JSON en `packages/scanner/test/fixtures/native/`.

## 10. Entorno local (opcional)
- [ ] `sudo apt-get install libavif16` para correr WebKit de Playwright en local (CI ya lo instala con `--with-deps`).

## 11. Datos reales 2D (opcional)
- [ ] Crear una cuenta en [BarBeR](https://ditto.ing.unimore.it/barber/) y descargar el dataset (8 748 imágenes 1D+2D
      con polígono y valor). Hoy `bench/dataset/public` solo tiene 1D reales (ArTe-Lab, KAIST, Muenster).

## 9. Conjunto `device` v2 (F10.4)
- [ ] Repartir productos en `bench/dataset/device/splits.json` y capturar según [docs/guias/captura-device.md](../guias/captura-device.md).
- [ ] `bun run bench/coverage.ts --dataset device --strict` en verde (hoy: 4 productos en dev, 0 en test).
- [ ] Clips reales cortos (5-10 s, mano en movimiento) para retomar M7 (promediado de perfiles entre frames).
