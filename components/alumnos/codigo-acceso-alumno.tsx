"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Muestra el código de acceso del alumno (solo admin) y permite copiar el
 *  enlace completo del portal para pasárselo. */
export function CodigoAccesoAlumno({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    const url = `${window.location.origin}/alumno?codigo=${codigo}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el navegador bloquea el portapapeles, el código igual queda visible.
    }
  };

  return (
    <div>
      <dt className="text-xs text-ink-muted">Acceso del alumno (portal)</dt>
      <dd className="mt-1 space-y-1.5">
        <code className="block rounded-lg bg-blush-soft/40 px-2 py-1 font-mono text-xs text-ink">
          {codigo}
        </code>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blush-deep transition-colors hover:text-ink"
        >
          {copiado ? (
            <>
              <Check className="h-3.5 w-3.5" /> ¡Enlace copiado!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copiar enlace de acceso
            </>
          )}
        </button>
      </dd>
    </div>
  );
}
