"use client";

import { useActionState } from "react";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { ingresarAlumnoAction, type IngresoState } from "@/app/actions/portal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function IngresoForm({ codigoInicial }: { codigoInicial: string }) {
  const [state, formAction, pending] = useActionState<IngresoState, FormData>(
    ingresarAlumnoAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Código de acceso</Label>
        <Input
          name="codigo"
          defaultValue={codigoInicial}
          placeholder="Ej: a1b2c3d4e5f6"
          autoComplete="off"
          autoFocus
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
