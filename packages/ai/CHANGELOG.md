# @qhago/ai

## 0.1.0-beta.1

### Patch Changes

- 317f558: El peer `@qhago/scanner` pasa a `>=0.1.0-beta.0 <2.0.0 || >=1.0.0-0 <2.0.0`. Con `>=0.1.0-beta.0`, npm rechazaba
  (`ERESOLVE`) las prereleases de `@qhago/scanner` de otra versión base, como `1.0.0-rc.N`. Si usas `@qhago/ai@0.1.0-beta.0`,
  actualiza a esta versión antes de pasar a `@qhago/scanner@1.0.0-rc` o `1.0.0`.

## 0.1.0-beta.0

### Minor Changes

- 6f07037: Primera beta pública del detector IA opcional. Experimental: aún no supera el gate G5 (ver MODEL_CARD.md).
