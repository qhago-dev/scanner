// Worker interno (ADR-02): decode() y sesiones de escaneo. Un único módulo sin import() dinámicos
// (Vite construye los workers en formato iife por defecto).
import { startWorkerHost } from "./host";

startWorkerHost();
