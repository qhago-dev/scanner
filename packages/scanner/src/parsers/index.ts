// @qhago/scanner/parsers — funciones puras, sin dependencias del motor.
export { type AAMVAData, isAAMVA, parseAAMVA } from "./aamva";
export { type GS1Data, type GS1Element, gs1CheckDigit, parseGS1 } from "./gs1";
export { type ISO15434Envelope, isISO15434, parseISO15434 } from "./iso15434";
export { parseQRContent, type QRContent } from "./qr";
