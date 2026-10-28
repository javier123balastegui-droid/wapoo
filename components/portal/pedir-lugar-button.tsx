"use client";

import { useActionState } from "react";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import {
  pedirUnirseAClaseAction,
  type PedirLugarState,
} from "@/app/actions/portal";

/** Botón "Pedir lugar" de una clase grupal. Muestra el motivo cuando no se
 *  puede (por ejemplo, si el alumno ya tiene otra clase a esa misma hora). */
export function PedirLugarButton({ claseId }: { claseId: string }) {
  const [state, formAction, pending] = useActionState<
    PedirLugarState,
    FormData
  >(pedirUnirseAClaseAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="claseId" value={claseId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blush px-4 text-sm font-medium text-ink shadow-blush transition-colors hover:bg-blush-deep disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Pidiendo…
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" /> Pedir lugar
          </>
        )}
      </button>
      {state?.error && (
        <p
          role="alert"
          className="flex max-w-xs items-start gap-1.5 rounded-xl bg-[#fbeaea] px-3 py-2 text-right text-xs text-[#a85d5d]"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}
    </form>
  );
}
