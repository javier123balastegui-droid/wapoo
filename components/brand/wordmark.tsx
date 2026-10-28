import Image from "next/image";
import { cn } from "@/lib/utils";

/** Lo que muestra la marca de una academia. Sale de su fila en
 *  organizaciones (ver marcaDe en lib/organizacion.ts). */
export type Marca = { nombre: string; directora: string; logoUrl: string };

/** Marca de la academia: logo + nombre + directora.
 *  `light` para usarla sobre fondos oscuros/rosados.
 *  La marca es obligatoria a propósito: sin ella, una academia mostraría la
 *  de otra. */
export function Wordmark({
  marca,
  className,
  compact = false,
  light = false,
}: {
  marca: Marca;
  className?: string;
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Monogram marca={marca} light={light} />
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span
            className={cn(
              "font-display text-lg font-semibold leading-[1.05] tracking-tight",
              light ? "text-cream" : "text-ink",
            )}
          >
            {marca.nombre}
          </span>
          {marca.directora && (
            <span
              className={cn(
                "mt-0.5 text-[10px] uppercase tracking-[0.16em]",
                light ? "text-[#f3d9a6]" : "text-copper",
              )}
            >
              Dir. {marca.directora}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function Monogram({
  marca,
  className,
  light = false,
}: {
  marca: Marca;
  className?: string;
  light?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative grid h-10 w-10 shrink-0 overflow-hidden rounded-full bg-cream shadow-soft ring-1",
        light ? "ring-white/40" : "ring-copper/40",
        className,
      )}
      aria-hidden
    >
      {marca.logoUrl ? (
        <Image
          src={marca.logoUrl}
          alt=""
          fill
          sizes="40px"
          // Un logo subido a otro sitio (Supabase Storage) se muestra tal cual,
          // sin pasar por el optimizador de imágenes.
          unoptimized={/^https?:/.test(marca.logoUrl)}
          className="scale-[1.55] object-contain"
        />
      ) : (
        // Sin logo cargado: la inicial de la academia.
        <span className="m-auto font-display text-lg font-semibold text-ink">
          {marca.nombre.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
