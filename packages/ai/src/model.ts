// Constantes del modelo detector-v1 (training/models/centernet_lite.py). Cambiarlas exige reentrenar.
export const INPUT = 320;
export const STRIDE = 4;
export const GRID = INPUT / STRIDE;
export const CORNER_SCALE = 32;
/** Valor de relleno del letterbox (como en el entrenamiento: 114/255). */
export const PAD = 114 / 255;
/** Clase del detector → formatos a probar primero. */
export const CLASS_FORMATS = [
  ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf"],
  ["qr_code"],
  ["data_matrix"],
  ["pdf417"],
  ["aztec"],
] as const;
export const NUM_CLASSES = CLASS_FORMATS.length;
