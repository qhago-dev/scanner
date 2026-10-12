# Componente `<qhago-scanner>`

Cámara, overlay, guía y controles en un custom element (sin framework):

```html
<qhago-scanner formats="ean_13,ean_8,upc_a,qr_code" torch-button switch-camera-button lang="es"></qhago-scanner>
<script type="module">
  import "@qhago/scanner/ui"; // registra el elemento (seguro en SSR: no hace nada sin customElements)
  const el = document.querySelector("qhago-scanner");
  el.addEventListener("detect", (e) => console.log(e.detail.text));
  el.addEventListener("error", (e) => console.error(e.detail.code, e.detail.docsUrl));
</script>
```

| Atributo | Efecto |
|---|---|
| `formats` | Lista separada por comas (formatos desconocidos se ignoran con un aviso) |
| `roi` | Región normalizada `x,y,ancho,alto` |
| `torch-button`, `switch-camera-button` | Muestran esos botones si el dispositivo lo permite |
| `lang` | `es` o `en` (textos; personalizables con la propiedad `labels`) |
| `paused` | Pausa el escaneo |

Eventos: `detect` y `candidate` (`detail` = resultado con `trackId`), `statechange` y `error`. La propiedad
`options` acepta el resto de opciones de `createScanner` (p. ej. `camera`, `maxFps`, o `workerFactory`/`plugins` de
`@qhago/ai`) y se aplica en el siguiente arranque.
