# Sprint 4 — Pipeline de cámara real y pruebas integradas

**Duración estimada**: 2-3 días
**Prioridad**: Alta (sin esto no hay escaneo con cámara real)
**Depende de**: Sprint 1 (ZXing), Sprint 2 (ONNX), Sprint 3 (modelos)

---

## Requerimiento

Conectar el pipeline completo a una cámara real (`getUserMedia`), ejecutar el loop de escaneo frame-por-frame con tracking adaptativo, y verificar que el sistema funciona end-to-end: cámara → autofocus → detección → preprocesamiento → decodificación → resultado.

### Lo que debe hacer

1. Inicializar cámara con constraints óptimos para escaneo (environment-facing, 640x480)
2. Loop de escaneo a 10-15 FPS con `requestAnimationFrame`
3. Pipeline completo por frame: autofocus → skip si blur → detección → crop → SR/deblur/perspectiva → ZXing
4. Tracking adaptativo: si el código no cambió, emitir `tracking` sin re-ejecutar detección
5. Emitir eventos `decode`, `tracking`, `lost`, `focus`, `error` al listener JS
6. Overlay visual opcional: dibujar bounding box del código detectado sobre el video

### Criterios de aceptación

- [ ] Apuntar cámara a un código de barras real → evento `decode` en <200ms
- [ ] Mover cámara a otro código → nuevo `decode` en <500ms
- [ ] Apuntar a una pared (sin código) → evento `lost`
- [ ] Tapar la cámara (oscuro total) → evento `focus: false`, no se ejecuta pipeline
- [ ] Mismo código en frame consecutivo → evento `tracking`, no `decode`
- [ ] Sin memory leaks después de 5 minutos de escaneo continuo
