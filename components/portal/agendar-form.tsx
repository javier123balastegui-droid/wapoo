"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, CalendarPlus, AlertCircle } from "lucide-react";
import {
  agendarClaseAction,
  horariosDelDiaAction,
  type AgendarState,
} from "@/app/actions/portal";
import type { SlotAlumno } from "@/lib/disponibilidad";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { opcionesDuracion, type ReglasAgenda } from "@/lib/agenda-reglas";
import { minutosAHora } from "@/lib/utils";
import { enZonaDelAlumno, etiquetaDeZona } from "@/lib/fechas";

/** Franja de atención de un día, en minutos; null = ese día no hay clases. */
type Franja = { apertura: number; cierre: number } | null;

export function AgendarForm({
  zona,
  horarios,
  reglas,
  zonaAcademia,
  hoy,
}: {
  zona?: string;
  /** Horarios de la academia, 0 = domingo … 6 = sábado. */
  horarios: Franja[];
  /** Duraciones de la academia. */
  reglas: ReglasAgenda;
  /** Zona horaria de la academia y "hoy" en esa zona (del servidor: antes se
   *  sacaba de la hora UTC del navegador, y desde las 21 de Argentina el
   *  formulario creía que ya era mañana). */
  zonaAcademia: string;
  hoy: string;
}) {
  const [state, formAction, pending] = useActionState<AgendarState, FormData>(
    agendarClaseAction,
    undefined,
  );
  const [duracion, setDuracion] = useState(reglas.duracionMinima);
  const [fecha, setFecha] = useState("");
  const [slots, setSlots] = useState<SlotAlumno[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Los horarios se eligen en la hora de la academia (es la agenda del profe).
  // A un alumno de otra zona se le muestra también la suya, para no confundirse.
  const horaDelSlot = (inicioMin: number) => {
    const arg = minutosAHora(inicioMin);
    if (!zona || zona === zonaAcademia || !fecha) return arg;
    const suya = enZonaDelAlumno(fecha, inicioMin, zona, zonaAcademia);
    return `${suya.hora} (tu hora) · ${arg} ${etiquetaDeZona(zonaAcademia)}`;
  };

  // La ventana de atención depende del día y de la academia.
  const ventana = fecha
    ? (horarios[new Date(`${fecha}T00:00:00`).getDay()] ?? null)
    : null;
  const diaCerrado = fecha !== "" && ventana === null;

  // Cada vez que cambia el día o la duración, le preguntamos al servidor qué
  // horarios quedan libres (los ocupados por otra clase se muestran tachados).
  // Si llega tarde la respuesta de un pedido viejo, se descarta.
  const pedido = useRef(0);
  function elegir(nuevaFecha: string, nuevaDuracion: number) {
    setFecha(nuevaFecha);
    setDuracion(nuevaDuracion);
    const este = ++pedido.current;
    if (!nuevaFecha) {
      setSlots([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    horariosDelDiaAction(nuevaFecha, nuevaDuracion)
      .then((r) => {
        if (pedido.current === este) setSlots(r);
      })
      .catch(() => {
        if (pedido.current === este) setSlots([]);
      })
      .finally(() => {
        if (pedido.current === este) setBuscando(false);
      });
  }

  const libres = slots.filter((s) => s.libre);
  const primerLibre = libres[0]?.inicioMin;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de clase">
          <Select name="tipo" defaultValue="INDIVIDUAL">
            <option value="INDIVIDUAL">Individual</option>
            <option value="GRUPAL">Grupal</option>
          </Select>
        </Field>
        <Field label="Duración">
          <Select
            name="duracion"
            value={String(duracion)}
            onChange={(e) => elegir(fecha, Number(e.target.value))}
          >
            {opcionesDuracion(reglas).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Día">
          <Input
            type="date"
            name="fecha"
            min={hoy}
            value={fecha}
            onChange={(e) => elegir(e.target.value, duracion)}
          />
        </Field>
        <Field label="Horario">
          <Select
            name="inicioMin"
            key={`${fecha}-${duracion}`}
            defaultValue={primerLibre != null ? String(primerLibre) : ""}
            disabled={libres.length === 0}
          >
            {slots.length === 0 ? (
              <option value="">
                {buscando
                  ? "Buscando horarios…"
                  : diaCerrado
                    ? "Ese día no hay clases"
                    : "Elegí primero un día"}
              </option>
            ) : (
              <>
                {libres.length === 0 && (
                  <option value="">No queda lugar ese día</option>
                )}
                {slots.map((s) => (
                  <option
                    key={s.inicioMin}
                    value={s.inicioMin}
                    disabled={!s.libre}
                  >
                    {horaDelSlot(s.inicioMin)}
                    {s.motivo === "ocupado"
                      ? " — ocupado"
                      : s.motivo === "pasado"
                        ? " — ya pasó"
                        : ""}
                  </option>
                ))}
              </>
            )}
          </Select>
        </Field>
      </div>

      {fecha && !buscando && slots.length > 0 && libres.length === 0 && (
        <p className="rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]">
          Ese día ya está completo. Probá con otro día o con una duración más
          corta.
        </p>
      )}

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Agendando…
          </>
        ) : (
          <>
            <CalendarPlus className="h-4 w-4" /> Reservar clase
          </>
        )}
      </Button>
      <p className="text-xs text-ink-muted">
        La academia te asignará el profesor y confirmará la seña. La clase queda
        como “Sin señar” hasta que registren tu pago.
      </p>
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
