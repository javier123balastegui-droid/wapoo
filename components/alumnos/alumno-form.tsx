"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ZONAS_HORARIAS, etiquetaDeZona, zonaDeTelefono } from "@/lib/fechas";
import type { Alumno } from "@/lib/types";
import type { AlumnoFormState } from "@/app/actions/alumnos";

export function AlumnoForm({
  action,
  alumno,
  esAdmin,
  carreras,
  zonaAcademia,
}: {
  action: (state: AlumnoFormState, formData: FormData) => Promise<AlumnoFormState>;
  alumno?: Alumno;
  esAdmin: boolean;
  /** Las que se ofrecen hoy (Panel → Carreras). */
  carreras: string[];
  /** Zona horaria de la academia (la que vale por defecto). */
  zonaAcademia: string;
}) {
  const [state, formAction, pending] = useActionState<AlumnoFormState, FormData>(
    action,
    undefined,
  );

  // Zona horaria. El prefijo del teléfono la sugiere, pero nunca pisa una
  // elección: solo se autocompleta si el alumno no tiene ninguna cargada y
  // todavía no se tocó el selector. Si ya tenía una y el prefijo dice otra
  // cosa, no se cambia nada: se avisa y decide quien está cargando.
  const [telefono, setTelefono] = useState(alumno?.telefono ?? "");
  const [zona, setZona] = useState(alumno?.zonaHoraria ?? "");
  const [elegidaAMano, setElegidaAMano] = useState(false);

  const sugerida = zonaDeTelefono(telefono, zonaAcademia);
  const autocompletar = !elegidaAMano && !zona && sugerida;
  const zonaMostrada = autocompletar ? sugerida.zona : zona;

  const pista = !sugerida
    ? null
    : autocompletar
      ? `Lo pusimos por el prefijo del número (${sugerida.etiqueta}).` +
        (sugerida.dudosa
          ? " Ese país tiene más de un huso horario, así que confirmalo con el alumno."
          : " Si no es así, cambialo.")
      : sugerida.zona !== zonaMostrada
        ? `Ojo: por el prefijo del número, el alumno estaría en ${sugerida.etiqueta}.`
        : null;

  // Si el alumno tiene una carrera que ya no se ofrece, la dejamos en la lista
  // para no cambiársela sin querer al guardar.
  const opciones =
    alumno?.carrera && !carreras.includes(alumno.carrera)
      ? [alumno.carrera, ...carreras]
      : carreras;

  return (
    <form action={formAction} className="space-y-5">
      {alumno && <input type="hidden" name="id" value={alumno.id} />}

      <Field label="Nombre y apellido" error={state?.errors?.nombre}>
        <Input
          name="nombre"
          defaultValue={alumno?.nombre}
          placeholder="Nombre y apellido"
        />
      </Field>

      <Field label="Carrera">
        <Select name="carrera" defaultValue={alumno?.carrera ?? carreras[0]}>
          {opciones.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>

      {esAdmin && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email (opcional)">
            <Input
              name="email"
              type="email"
              defaultValue={alumno?.email}
              placeholder="alumno@email.com"
            />
          </Field>
          <Field label="Teléfono / WhatsApp (opcional)">
            <Input
              name="telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="11-5555-0000"
            />
          </Field>
        </div>
      )}

      <Field label={`Zona horaria (si el alumno no está en ${etiquetaDeZona(zonaAcademia)})`}>
        <Select
          name="zonaHoraria"
          value={zonaMostrada}
          onChange={(e) => {
            setZona(e.target.value);
            setElegidaAMano(true);
          }}
        >
          <option value="">{etiquetaDeZona(zonaAcademia)} (por defecto)</option>
          {ZONAS_HORARIAS.filter((z) => z.zona !== zonaAcademia).map((z) => (
            <option key={z.zona} value={z.zona}>
              {z.etiqueta}
            </option>
          ))}
        </Select>
        {pista && <p className="mt-1.5 text-xs text-ink-muted">{pista}</p>}
      </Field>

      <Field label="Notas (opcional)">
        <Textarea
          name="notas"
          defaultValue={alumno?.notas}
          rows={3}
          placeholder="Datos útiles del alumno (año que cursa, objetivos, etc.)"
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

      <div className="flex items-center gap-4 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> {alumno ? "Guardar cambios" : "Crear alumno"}
            </>
          )}
        </Button>
        <Link
          href={alumno ? `/panel/alumnos/${alumno.id}` : "/panel/alumnos"}
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
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-[#a85d5d]">{error}</p>}
    </div>
  );
}
