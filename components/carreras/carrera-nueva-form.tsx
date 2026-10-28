"use client";

import { useActionState } from "react";
import { Loader2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  crearCarreraAction,
  type CarreraFormState,
} from "@/app/actions/carreras";

/** Alta de una carrera nueva, desde Panel → Carreras. */
export function CarreraNuevaForm() {
  const [state, action, pending] = useActionState<CarreraFormState, FormData>(
    crearCarreraAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="nombre"
          placeholder="Nombre de la carrera (ej: Bioimágenes)"
          required
          className="sm:flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Agregar
        </Button>
      </div>
      {state?.error && (
        <p className="flex items-center gap-1 text-sm text-pago-debe">
          <AlertCircle className="h-4 w-4" /> {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-1 text-sm text-pago-ok">
          <CheckCircle2 className="h-4 w-4" /> {state.ok}
        </p>
      )}
    </form>
  );
}
