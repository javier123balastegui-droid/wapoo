"use client";

import { useActionState } from "react";
import { Loader2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  agregarDiaSinClaseAction,
  type DiaFormState,
} from "@/app/actions/dias-sin-clase";

/** Carga un día (o un rango de días) en los que no se da clase. */
export function DiaSinClaseForm({ hoy }: { hoy: string }) {
  const [state, action, pending] = useActionState<DiaFormState, FormData>(
    agregarDiaSinClaseAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="desde">Día</Label>
          <Input id="desde" name="desde" type="date" min={hoy} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta">Hasta (opcional)</Label>
          <Input id="hasta" name="hasta" type="date" min={hoy} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <Input id="motivo" name="motivo" placeholder="Feriado, viaje…" />
        </div>
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Agregar
      </Button>
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
