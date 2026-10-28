"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RecursosEditor } from "./recursos-editor";
import type { Tema } from "@/lib/types";
import type { TemaFormState } from "@/app/actions/temario";

export function TemaForm({
  action,
  tema,
}: {
  action: (state: TemaFormState, formData: FormData) => Promise<TemaFormState>;
  tema?: Tema;
}) {
  const [state, formAction, pending] = useActionState<TemaFormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-6">
      {tema && <input type="hidden" name="id" value={tema.id} />}

      <Field label="Título">
        <Input
          name="titulo"
          defaultValue={tema?.titulo}
          placeholder="Título del tema"
        />
        {state?.errors?.titulo && <Err>{state.errors.titulo}</Err>}
      </Field>

      <Field label="Descripción breve">
        <Input
          name="descripcion"
          defaultValue={tema?.descripcion}
          placeholder="Una línea que resuma el tema"
        />
      </Field>

      <Field
        label="Contenido y objetivos"
        hint="Texto libre. Las líneas que comienzan con “- ” se muestran como lista; las que terminan en “:”, como subtítulo."
      >
        <Textarea
          name="contenido"
          defaultValue={tema?.contenido}
          rows={10}
          placeholder={"Objetivos:\n- Identificar…\n- Reconocer…"}
        />
      </Field>

      <Field label="Material (enlaces o archivos)">
        <RecursosEditor name="recursos" initial={tema?.recursos ?? []} />
      </Field>

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> {tema ? "Guardar cambios" : "Crear tema"}
            </>
          )}
        </Button>
        <Link
          href={tema ? `/panel/temario/${tema.id}` : "/panel/temario"}
          className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {children}
    </div>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#a85d5d]">{children}</p>;
}
