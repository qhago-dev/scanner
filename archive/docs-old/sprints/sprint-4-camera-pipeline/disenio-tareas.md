# Sprint 4 — Diseño y tareas

## Diseño: Loop de escaneo

```
┌─────────────────────────────────────────────┐
│  requestAnimationFrame loop (JS)            │
│                                             │
│  cada ~100ms:                               │
│    1. ctx.drawImage(video, 0, 0)            │
│    2. imageData = ctx.getImageData(...)     │
│    3. wasmScanner.process_frame(            │
│         imageData.data, w, h, "rgba8"       │
│       )                                     │
│    4. events = JSON.parse(result)           │
│    5. emitir eventos a listeners            │
│                                             │
│  Si tracking_mode:                          │
│    - crop manual del último ROI             │
│    - solo ZXing, sin pipeline AI            │
│    - reset si 10 frames sin resultado       │
└─────────────────────────────────────────────┘
```

## Tareas

### T4.1 — Implementar `processFrame` real en Rust

**Esfuerzo**: 4h
**Archivos**: `core/src/pipeline.rs`

- [ ] Eliminar placeholders: `run_autofocus()` debe llamar al bridge ORT real (no skip)
- [ ] Verificar que la imagen RGBA → grayscale se hace correctamente
- [ ] Asegurar que `crop_region` respeta límites de la imagen
- [ ] Agregar logs de tiempo por etapa (`console.log` vía `web_sys::console`)

### T4.2 — Probar loop de cámara en browser real

**Esfuerzo**: 4h
**Archivos**: `sdk/src/AIScanner.ts`

- [ ] Corregir `attachCamera`: manejar resize del canvas, aspect ratio
- [ ] Agregar `facingMode: "environment"` (cámara trasera en móviles)
- [ ] Manejar `video.readyState` correctamente antes de dibujar
- [ ] Reducir `maxResolutionWidth` a 480 para móviles de gama media
- [ ] Agregar botón de torch (linterna) si está disponible

### T4.3 — Depurar tracking adaptativo

**Esfuerzo**: 3h
**Archivos**: `core/src/tracking.rs`

- [ ] Probar que `should_skip_pipeline()` funciona: mismo código → `true`
- [ ] Probar que se resetea tras 10 frames sin resultado
- [ ] Ajustar `ROI_EXPAND_FACTOR` (20% es razonable, validar empíricamente)
- [ ] Agregar logs de cuándo se activa/desactiva el tracking

### T4.4 — Prueba de estrés

**Esfuerzo**: 2h

- [ ] Escanear 100 códigos seguidos sin crash
- [ ] Medir FPS promedio en laptop y móvil
- [ ] Medir uso de memoria (Chrome DevTools → Memory → Take snapshot)
- [ ] Verificar que no hay acumulación de event listeners

### T4.5 — Overlay visual (opcional)

**Esfuerzo**: 3h
**Archivos**: `sdk/src/`

- [ ] Dibujar rectángulo verde sobre el código detectado
- [ ] Animación de "scan found" (breve flash verde)
- [ ] Indicador de enfoque (rojo/verde) basado en evento `focus`

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `getImageData` es lento en Safari | Medio | Usar `willReadFrequently: true`, reducir resolución |
| Múltiples pestañas compiten por GPU | Bajo | Documentar, no es un bug del SDK |
| Cámara no disponible en HTTP (solo HTTPS) | Bajo | Documentar requisito de HTTPS/localhost |
