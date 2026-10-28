import Link from "next/link";
import { Clock, Users, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EstadoRealizacionIcono, EnVivoBadge } from "./estado-realizacion";
import { TIPO_CLASE_META, ESTADO_PAGO_META } from "@/lib/constants";
import { minutosAHora, cn } from "@/lib/utils";
import { estaEnVivo } from "@/lib/fechas";
import type { TipoClase, EstadoPago, EstadoRealizacion } from "@/lib/types";

export interface EventoAgenda {
  id: string;
  fecha: string;
  inicioMin: number;
  duracion: number;
  tipo: TipoClase;
  estadoRealizacion: EstadoRealizacion;
  temaTitulo: string;
  profeId: string;
  profeNombre: string;
  alumnos: {
    id: string;
    nombre: string;
    carrera: string;
    estadoPago?: EstadoPago;
  }[];
}

/** Carreras únicas de los alumnos del evento. En la agenda del staff se muestran
 *  en lugar del tema (lo pidió la dirección). Si no hay alumnos, se usa el tema. */
export function carrerasDeEvento(evento: EventoAgenda): string {
  return Array.from(
    new Set(evento.alumnos.map((a) => a.carrera).filter(Boolean)),
  ).join(" · ");
}

export function ClaseCard({
  evento,
  esAdmin,
  zona,
}: {
  evento: EventoAgenda;
  esAdmin: boolean;
  /** Zona horaria de la academia. */
  zona: string;
}) {
  const enVivo = estaEnVivo(evento.fecha, evento.inicioMin, evento.duracion, zona);
  return (
    // Sin precarga: en la agenda hay una tarjeta por clase, y precargarlas
    // todas disparaba decenas de pedidos al servidor por abrir la pantalla.
    <Link
      prefetch={false}
      href={`/panel/agenda/${evento.id}`}
      className="group block"
    >
      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Clock className="h-3.5 w-3.5 text-blush-deep" />
            {minutosAHora(evento.inicioMin)}–
            {minutosAHora(evento.inicioMin + evento.duracion)}
          </span>
          <span className="flex items-center gap-1.5">
            {enVivo ? (
              <EnVivoBadge />
            ) : (
              <EstadoRealizacionIcono estado={evento.estadoRealizacion} />
            )}
            <Badge className="bg-beige/50 text-ink-soft">
              {TIPO_CLASE_META[evento.tipo].label}
            </Badge>
          </span>
        </div>

        <p className="mt-1.5 line-clamp-1 font-medium text-ink">
          {carrerasDeEvento(evento) || evento.temaTitulo}
        </p>

        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{evento.profeNombre}</span>
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-xs text-ink-muted">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {evento.alumnos.map((a) => a.nombre.split(" ")[0]).join(", ") ||
                "—"}
            </span>
          </span>
          {esAdmin && (
            <span className="flex shrink-0 items-center gap-1">
              {evento.alumnos.map(
                (a) =>
                  a.estadoPago && (
                    <span
                      key={a.id}
                      title={`${a.nombre}: ${ESTADO_PAGO_META[a.estadoPago].label}`}
                      className={cn(
                        "h-2 w-2 rounded-full",
                        ESTADO_PAGO_META[a.estadoPago].dot,
                      )}
                    />
                  ),
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
