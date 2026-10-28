import {
  CheckCircle2,
  CalendarClock,
  XCircle,
  Ban,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";
import { ESTADO_REALIZACION_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EstadoRealizacion } from "@/lib/types";

const ICONO: Record<EstadoRealizacion, LucideIcon> = {
  PENDIENTE: CircleDashed,
  REALIZADA: CheckCircle2,
  REAGENDADA: CalendarClock,
  CANCELADA: XCircle,
  AUSENTE: Ban,
};

/** Chip con ícono + texto del estado de realización (para el detalle). */
export function EstadoRealizacionBadge({
  estado,
}: {
  estado: EstadoRealizacion;
}) {
  const meta = ESTADO_REALIZACION_META[estado];
  const Icon = ICONO[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        meta.badge,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.corto}
    </span>
  );
}

/** Ícono compacto para las tarjetas de la agenda (nada si está sin marcar). */
export function EstadoRealizacionIcono({
  estado,
  className,
}: {
  estado: EstadoRealizacion;
  className?: string;
}) {
  if (estado === "PENDIENTE") return null;
  const meta = ESTADO_REALIZACION_META[estado];
  const Icon = ICONO[estado];
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0", meta.text, className)}
      aria-label={meta.corto}
    />
  );
}

/** Cartel "En vivo" (verde, pulsante) para la clase que se está dando ahora. */
export function EnVivoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-[#15a34a] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-soft",
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      En vivo
    </span>
  );
}
