"use client";

import { Trash2 } from "lucide-react";
import { eliminarSolicitudAction } from "@/app/actions/solicitudes";

export function EliminarSolicitudButton({ id }: { id: string }) {
  return (
    <form
      action={eliminarSolicitudAction}
      className="ml-auto"
      onSubmit={(e) => {
        if (
          !window.confirm(
            "¿Eliminar esta solicitud de forma permanente? Esta acción no puede deshacerse.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-[#a85d5d] transition-colors hover:bg-[#fbeaea]"
      >
        <Trash2 className="h-4 w-4" /> Eliminar
      </button>
    </form>
  );
}
