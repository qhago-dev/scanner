// Server component: importar el paquete en el servidor no debe romper (SSR-safe); el escaneo va en el cliente.
import { FORMATS } from "@qhago/scanner";
import Scan from "./scan";

export default function Page() {
  return (
    <main>
      <p id="formats">{FORMATS.length}</p>
      <Scan />
    </main>
  );
}
