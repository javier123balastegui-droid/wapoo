"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { eliminarClaseAction } from "@/app/actions/agenda";

export function DeleteClaseButton({ id }: { id: string }) {
  const [confirmar, setConfirmar] = useState(false);

  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium text-cream/90 transition-colors hover:bg-white/15 hover:text-white"
      >
        <Trash2 className="h-4 w-4" /> Eliminar
      </button>
    );
  }

  return (
    <form action={eliminarClaseAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm text-cream/85">¿Seguro?</span>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#b86b6b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#a85d5d]"
      >
        <Trash2 className="h-4 w-4" /> Sí, eliminar
      </button>
      <button
        type="button"
        onClick={() => setConfirmar(false)}
        className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-cream/90 transition-colors hover:text-white"
      >
        Cancelar
      </button>
    </form>
  );
}
