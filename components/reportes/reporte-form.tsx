"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ReporteFormState } from "@/app/actions/reportes";

interface AlumnoLite {
  id: string;
  nombre: string;
  carrera: string;
}

export interface ReportePrevio {
  metodo: string;
  temaDado: string;
  observaciones: string;
  porAlumno: Record<
    string,
    { queLeCosto: string; enfasis: string; loQueMasLeCuesta: string }
  >;
}

export function ReporteForm({
  action,
  claseId,
  alumnos,
  temaTitulo,
  previo,
}: {
  action: (
    state: ReporteFormState,
    formData: FormData,
  ) => Promise<ReporteFormState>;
  claseId: string;
  alumnos: AlumnoLite[];
  temaTitulo: string;
  previo: ReportePrevio | null;
}) {
  const [state, formAction, pending] = useActionState<
    ReporteFormState,
    FormData
  >(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="claseId" value={claseId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Método usado en la clase">
          <Textarea
            name="metodo"
            defaultValue={previo?.metodo}
            rows={2}
            placeholder="Metodología aplicada (disección guiada, modelos 3D, repaso oral…)"
          />
        </Field>
        <Field label="Tema dictado">
          <Input
            name="temaDado"
            defaultValue={previo?.temaDado ?? temaTitulo}
            placeholder="Tema efectivamente dictado"
          />
        </Field>
      </div>

      <div className="space-y-3">
        <p className="font-display text-lg font-semibold text-ink">
          Evolución por alumno
        </p>
        {alumnos.map((a) => {
          const p = previo?.porAlumno[a.id];
          return (
            <div
              key={a.id}
              className="rounded-2xl border border-line bg-surface-rose/30 p-4"
            >
              <p className="font-medium text-ink">
                {a.nombre}{" "}
                <span className="text-xs font-normal text-ink-muted">
                  · {a.carrera}
                </span>
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Dificultades en la clase">
                  <Textarea
                    name={`qlc_${a.id}`}
                    defaultValue={p?.queLeCosto}
                    rows={3}
                  />
                </Field>
                <Field label="Aspectos a reforzar">
                  <Textarea
                    name={`enf_${a.id}`}
                    defaultValue={p?.enfasis}
                    rows={3}
                  />
                </Field>
                <Field label="Mayor dificultad">
                  <Textarea
                    name={`lqmlc_${a.id}`}
                    defaultValue={p?.loQueMasLeCuesta}
                    rows={3}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <Field label="Observaciones">
        <Textarea
          name="observaciones"
          defaultValue={previo?.observaciones}
          rows={3}
          placeholder="Comentarios u observaciones relevantes de la clase."
        />
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

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Guardar reporte
            </>
          )}
        </Button>
        <Link
          href={`/panel/agenda/${claseId}`}
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
