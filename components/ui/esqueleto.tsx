import { cn } from "@/lib/utils";

/**
 * Bloques grises que se muestran mientras la pantalla carga.
 *
 * Sin esto, al tocar una sección del panel el navegador se queda mostrando la
 * pantalla anterior, quieta, hasta que el servidor contesta entera: aunque
 * tarde poco, se siente como si la app se hubiera colgado. Con el esqueleto la
 * pantalla cambia al instante y el contenido entra cuando llega.
 *
 * No intenta imitar cada pantalla al detalle: alcanza con que tenga la forma
 * general (un título, unas tarjetas) para que el cambio no se sienta brusco.
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-white/15", className)}
      aria-hidden
    />
  );
}

/** El encabezado de una pantalla del panel: título y bajada. */
export function EsqueletoEncabezado() {
  return (
    <div className="space-y-3">
      <Esqueleto className="h-10 w-64" />
      <Esqueleto className="h-4 w-96 max-w-full" />
    </div>
  );
}

/** Una lista de tarjetas, que es la forma de casi todas las pantallas. */
export function EsqueletoTarjetas({ cuantas = 4 }: { cuantas?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cuantas }, (_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-line bg-surface p-5 shadow-card"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded-lg bg-ink/10" />
            <div className="h-4 w-2/3 rounded-lg bg-ink/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * La pantalla de carga completa del panel. Se usa en los `loading.tsx`, que
 * Next muestra apenas se toca un enlace, antes de que el servidor conteste.
 */
export function EsqueletoPantalla({ tarjetas = 4 }: { tarjetas?: number }) {
  return (
    <div className="space-y-6">
      <EsqueletoEncabezado />
      <EsqueletoTarjetas cuantas={tarjetas} />
      <span className="sr-only" role="status">
        Cargando…
      </span>
    </div>
  );
}
