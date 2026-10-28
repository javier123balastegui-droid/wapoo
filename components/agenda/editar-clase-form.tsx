"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlumnoMultiselect } from "./alumno-multiselect";
import { opcionesDuracion, type ReglasAgenda } from "@/lib/agenda-reglas";
import { minutosAHora } from "@/lib/utils";
import type { EditarClaseState } from "@/app/actions/agenda";
import type { Clase } from "@/lib/types";

export function EditarClaseForm({
  action,
  clase,
  profes,
  temas,
  alumnos,
  reglas,
}: {
  action: (
    state: EditarClaseState,
    formData: FormData,
  ) => Promise<EditarClaseState>;
  clase: Clase;
  profes: { id: string; nombre: string }[];
  temas: { id: string; titulo: string }[];
  alumnos: { id: string; nombre: string; carrera: string }[];
  /** Duraciones y franja de la academia. */
  reglas: ReglasAgenda;
}) {
  const [state, formAction, pending] = useActionState<
    EditarClaseState,
    FormData
  >(action, undefined);
  const [duracion, setDuracion] = useState<number>(clase.duracion);
  const [alumnoIds, setAlumnoIds] = useState<string[]>(clase.alumnoIds);

  // Horarios de inicio posibles según la duración (que termine antes del cierre).
  const horas: number[] = [];
  for (let m = reglas.apertura; m + duracion <= reglas.cierre; m += reglas.pasoDuracion) {
    horas.push(m);
  }
  // El horario actual de la clase puede no caer en la grilla de 30 min: lo sumo.
  if (!horas.includes(clase.inicioMin)) horas.push(clase.inicioMin);
  horas.sort((a, b) => a - b);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={clase.id} />
      <input type="hidden" name="alumnoIds" value={JSON.stringify(alumnoIds)} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo de clase">
          <Select name="tipo" defaultValue={clase.tipo}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="GRUPAL">Grupal</option>
          </Select>
        </Field>

        <Field label="Profesor/a">
          <Select name="profeId" defaultValue={clase.profeId}>
            <option value="">Sin asignar</option>
            {profes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tema">
          <Select name="temaId" defaultValue={clase.temaId}>
            <option value="">Sin asignar</option>
            {temas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Duración">
          <Select
            name="duracion"
            value={String(duracion)}
            onChange={(e) => setDuracion(Number(e.target.value))}
          >
            {opcionesDuracion(reglas).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Día">
          <Input type="date" name="fecha" defaultValue={clase.fecha} />
        </Field>

        <Field label="Horario">
          <Select name="inicioMin" defaultValue={String(clase.inicioMin)}>
            {horas.map((m) => (
              <option key={m} value={m}>
                {minutosAHora(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label>Alumno/s</Label>
        <AlumnoMultiselect
          alumnos={alumnos}
          value={alumnoIds}
          onChange={setAlumnoIds}
        />
        <p className="text-xs text-ink-muted">
          Al sumar a alguien se le crea la seña pendiente; al sacarlo se borra su
          pago de esta clase. El precio por alumno se recalcula solo.
        </p>
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

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Guardar cambios
            </>
          )}
        </Button>

        {/* Se superpone con otra clase: la directora puede guardarla igual
            (a diferencia del portal del alumno, donde queda bloqueado). */}
        {state?.superposicion && (
          <Button
            type="submit"
            name="confirmarSuperposicion"
            value="si"
            variant="outline"
            disabled={pending}
          >
            Guardar de todos modos
          </Button>
        )}

        {/* Se saca a alguien que ya había pagado: borrar ese registro de plata
            necesita un segundo toque, para que no pase sin querer. */}
        {state?.bajasConPago && (
          <Button
            type="submit"
            name="confirmarBajas"
            value="si"
            variant="outline"
            disabled={pending}
          >
            Sacar y borrar el pago
          </Button>
        )}
        <Link
          href={`/panel/agenda/${clase.id}`}
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
      <Label>{label}</Label>
      {children}
    </div>
  );
}
