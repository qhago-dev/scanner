# Frameworks

La librería no depende de ningún framework. Patrón común: crear el escáner al montar y destruirlo al desmontar.

## React

```tsx
import { createScanner } from "@qhago/scanner";
import { useEffect, useRef } from "react";

export function Escaner({ onCode }: { onCode: (t: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const s = createScanner({ video: video.current!, formats: ["ean_13", "qr_code"] });
    const off = s.on("detect", ({ result }) => onCode(result.text));
    s.start().catch(console.error);
    return () => { off(); s.destroy(); };
  }, [onCode]);
  return <video ref={video} />;
}
```

## Next.js (App Router)

Importar `@qhago/scanner` en un server component no rompe (es seguro en SSR), pero la cámara y `decode()` del
navegador van en un client component (`"use client"`), idealmente con `import()` dinámico dentro de un efecto.
Verificado con `next build` + `next start` en `apps/tarball/next-app-router`.

## Vue / Nuxt

```vue
<script setup lang="ts">
import { createScanner, type Scanner } from "@qhago/scanner";
import { onBeforeUnmount, onMounted, ref } from "vue";
const video = ref<HTMLVideoElement>();
let s: Scanner | undefined;
onMounted(() => {
  s = createScanner({ video: video.value!, formats: ["ean_13", "qr_code"] });
  s.on("detect", ({ result }) => console.log(result.text));
  s.start();
});
onBeforeUnmount(() => s?.destroy());
</script>
<template><video ref="video" /></template>
```

En Nuxt, envuelve el componente en `<ClientOnly>`.

## Svelte / Angular / otros

El mismo patrón (`onMount`/`onDestroy`, `ngAfterViewInit`/`ngOnDestroy`), o el componente
[`<qhago-scanner>`](/guia/ui), que funciona en cualquier framework que admita custom elements.

## Astro

Usa un `<script>` en la página (Astro lo empaqueta) o una isla cliente. Verificado en `apps/tarball/astro`.
