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
