import { EsqueletoPantalla } from "@/components/ui/esqueleto";

/** La agenda es la más pesada: conviene que avise enseguida que está cargando. */
export default function Cargando() {
  return <EsqueletoPantalla tarjetas={6} />;
}
