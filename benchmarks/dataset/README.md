# Benchmark Dataset

Dataset reproducible de 5,000 imágenes para comparar ScanAI SDK vs QuaggaJS.

## Escenarios (500 imágenes cada uno)

| # | Escenario | Descripción |
|---|-----------|-------------|
| 1 | Normal Light | Iluminación estándar (>300 lux) |
| 2 | Low Light | Baja iluminación (<50 lux simulado) |
| 3 | Motion Blur | Desenfoque por movimiento (kernel 5-25px) |
| 4 | Wrinkled | Códigos arrugados/doblados |
| 5 | Extreme Perspective | Ángulo >45 grados |
| 6 | Occluded | Oclusión parcial 20-50% |
| 7 | Small Codes | Códigos <50px en dimensión menor |
| 8 | Multiple Codes | 2-5 códigos en el mismo frame |
| 9 | Screen Glare | Reflexión/brillo de pantalla |
| 10 | Combined | Combinación adversa (borroso + inclinado + oscuro) |

## Formato

- Formato de imagen: PNG
- Tamaño: 640x480 (simulando cámara móvil)
- Ground truth: archivo JSON con el texto esperado

## Generación

```bash
cd benchmarks/dataset
python generate.py --num-images 5000
```

## Uso en benchmark

```bash
cd benchmarks/compare_quaggajs
npm run benchmark ../dataset/images
```
