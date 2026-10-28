"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, CalendarPlus, AlertCircle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AbanicoHorario } from "./abanico-horario";
import { AlumnoMultiselect } from "./alumno-multiselect";
import { opcionesDuracion, type ReglasAgenda } from "@/lib/agenda-reglas";
import type { ClaseFormState } from "@/app/actions/agenda";

interface ProfeLite {
  id: string;
  nombre: string;
}
interface TemaLite {
  id: string;
  titulo: string;
}
interface AlumnoLite {
  id: string;
  nombre: string;
  carrera: string;
}
interface ClaseLite {
  profeId: string;
  fecha: string;
  inicioMin: number;
  duracion: number;
}

export function ClaseForm({
  action,
  profes,
  temas,
  alumnos,
  clases,
  initialAlumnoIds,
  reglas,
  hoy,
}: {
  action: (state: ClaseFormState, formData: FormData) => Promise<ClaseFormState>;
  profes: ProfeLite[];
  temas: TemaLite[];
  alumnos: AlumnoLite[];
  clases: ClaseLite[];
  initialAlumnoIds?: string[];
  /** Duraciones y franja de la academia. */
  reglas: ReglasAgenda;
  /** "Hoy" en la zona de la academia (lo calcula el servidor). */
  hoy: string;
}) {
  const [state, formAction, pending] = useActionState<ClaseFormState, FormData>(
    action,
    undefined,
  );

  const [tipo, setTipo] = useState<"GRUPAL" | "INDIVIDUAL">("INDIVIDUAL");
  const [profeId, setProfeId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [duracion, setDuracion] = useState(reglas.duracionMinima);
  const [inicioMin, setInicioMin] = useState<number | null>(null);
  const [temaId, setTemaId] = useState("");
  const [alumnoIds, setAlumnoIds] = useState<string[]>(
    initialAlumnoIds ?? [],
  );

  const listo = Boolean(profeId && fecha);

  const ocupados = useMemo(
    () =>
      clases
        .filter((c) => c.profeId === profeId && c.fecha === fecha)
        .map((c) => ({ inicioMin: c.inicioMin, duracion: c.duracion })),
    [clases, profeId, fecha],
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="profeId" value={profeId} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="duracion" value={duracion} />
      <input type="hidden" name="inicioMin" value={inicioMin ?? ""} />
      <input type="hidden" name="temaId" value={temaId} />
      <input type="hidden" name="alumnoIds" value={JSON.stringify(alumnoIds)} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo de clase">
          <Select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL")
            }
          >
            <option value="INDIVIDUAL">Individual</option>
            <option value="GRUPAL">Grupal</option>
          </Select>
        </Field>

        <Field label="Profesor/a" error={state?.errors?.profeId}>
          <Select
            value={profeId}
            onChange={(e) => {
              setProfeId(e.target.value);
              setInicioMin(null);
            }}
          >
            <option value="">Seleccioná…</option>
            {profes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" error={state?.errors?.fecha}>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setInicioMin(null);
            }}
          />
        </Field>

        <Field label="Duración">
          <Select
            value={String(duracion)}
            onChange={(e) => {
              setDuracion(Number(e.target.value));
              setInicioMin(null);
            }}
          >
            {opcionesDuracion(reglas).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Horario disponible"
        hint="Hacé clic en el casillero para desplegar las opciones. Los horarios ya ocupados del profesor ese día aparecen tachados."
        error={state?.errors?.inicioMin}
      >
        <AbanicoHorario
          value={inicioMin}
          onChange={setInicioMin}
          duracion={duracion}
          ocupados={ocupados}
          disabled={!listo}
          reglas={reglas}
          />
      </Field>

      <Field label="Tema" error={state?.errors?.temaId}>
        <Select value={temaId} onChange={(e) => setTemaId(e.target.value)}>
          <option value="">Seleccioná un tema…</option>
          {temas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titulo}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Alumno/s" error={state?.errors?.alumnoIds}>
        <AlumnoMultiselect
          alumnos={alumnos}
          value={alumnoIds}
          onChange={setAlumnoIds}
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

      <div className="flex items-center gap-4 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <CalendarPlus className="h-4 w-4" /> Crear clase
            </>
          )}
        </Button>
        <Link
          href="/panel/agenda"
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
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {children}
      {error && <p className="text-sm text-[#a85d5d]">{error}</p>}
    </div>
  );
}
