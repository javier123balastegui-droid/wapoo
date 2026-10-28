"use client";

import { useState } from "react";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import { eliminarAlumnoAction } from "@/app/actions/alumnos";

export function EliminarAlumnoButton({
  id,
  nombre,
}: {
  id: string;
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1.5 text-sm font-medium text-cream/90 transition-colors hover:bg-white/10"
      >
        <Trash2 className="h-4 w-4" /> Eliminar
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-card">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <AlertCircle className="h-5 w-5 text-[#a85d5d]" />
              Eliminar alumno
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              Se eliminará a{" "}
              <span className="font-medium text-ink">{nombre}</span> de forma
              permanente, junto con sus inscripciones y registros de pago. Esta
              acción no puede deshacerse.
            </p>
            <form
              action={eliminarAlumnoAction}
              onSubmit={() => setEnviando(true)}
              className="mt-5 flex items-center justify-end gap-3"
            >
              <input type="hidden" name="id" value={id} />
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#a85d5d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#925050] disabled:opacity-60"
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Eliminando…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" /> Eliminar definitivamente
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
