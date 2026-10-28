import Link from "next/link";
import { Clock, CalendarPlus } from "lucide-react";
import { requireAlumno } from "@/lib/portal-auth";
import { getClasesDelAlumno, type ClaseAlumnoVista } from "@/lib/portal-data";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  EnVivoBadge,
  EstadoRealizacionBadge,
} from "@/components/agenda/estado-realizacion";
import { TIPO_CLASE_META } from "@/lib/constants";
import { fechaLargaES, hoyEn, estaEnVivo } from "@/lib/fechas";
import { HoraClase } from "@/components/portal/hora-clase";
import type { EstadoPago } from "@/lib/types";
import { zonaDe } from "@/lib/organizacion";

const ESTADO_ALUMNO: Record<EstadoPago, { label: string; badge: string }> = {
  SIN_PAGAR: { label: "Sin señar", badge: "bg-pago-sin-bg text-pago-sin" },
  SENADO: { label: "Señada", badge: "bg-pago-sena-bg text-pago-sena" },
  PAGADO: { label: "Pagada", badge: "bg-pago-ok-bg text-pago-ok" },
};

export default async function AlumnoInicioPage() {
  const alumno = await requireAlumno();
  const clases = await getClasesDelAlumno(alumno.organizacionId, alumno.id);
  const zonaAcademia = await zonaDe(alumno.organizacionId);
  const hoy = hoyEn(zonaAcademia);
  const proximas = clases.filter((c) => c.fecha >= hoy);
  const anteriores = clases.filter((c) => c.fecha < hoy).reverse();

  return (
    <div className="space-y-8 pt-4">
      <header>
        <p className="text-sm text-cream/80">Hola,</p>
        <h1 className="font-display text-3xl font-semibold text-cream">
          {alumno.nombre}
        </h1>
        <p className="mt-2 text-sm text-cream/85">
          Estas son tus clases. El estado de la seña lo actualiza la academia
          cuando recibe el pago.
        </p>
      </header>

      <Link
        href="/alumno/agendar"
        className={buttonVariants({ variant: "primary" })}
      >
        <CalendarPlus className="h-4 w-4" /> Agendar o sumarme a una clase
      </Link>

      <Seccion
          zona={alumno.zonaHoraria}
          zonaAcademia={zonaAcademia}
        titulo="Próximas clases"
        clases={proximas}
        vacio="Todavía no tenés clases próximas agendadas."
      />
      {anteriores.length > 0 && (
        <Seccion zona={alumno.zonaHoraria} zonaAcademia={zonaAcademia} titulo="Anteriores" clases={anteriores} vacio="" />
      )}
    </div>
  );
}

function Seccion({
  zona,
  zonaAcademia,
  titulo,
  clases,
  vacio,
}: {
  titulo: string;
  clases: ClaseAlumnoVista[];
  vacio: string;
  /** Zona horaria del alumno: si no está en la de la academia, ve su hora. */
  zona?: string;
  zonaAcademia: string;
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold text-cream">
        {titulo}
      </h2>
      {clases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 p-8 text-center text-sm text-cream/80">
          {vacio}
        </div>
      ) : (
        <div className="space-y-3">
          {clases.map((c) => {
            const est = ESTADO_ALUMNO[c.estadoPago];
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs capitalize text-ink-muted">
                      {fechaLargaES(c.fecha)}
                    </p>
                    <p className="mt-0.5 font-medium text-ink">
                      {c.temaTitulo}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blush-deep" />
                        <HoraClase
                          zonaAcademia={zonaAcademia}
                          fecha={c.fecha}
                          inicioMin={c.inicioMin}
                          duracion={c.duracion}
                          zona={zona}
                        />
                      </span>
                      <span>{TIPO_CLASE_META[c.tipo].label}</span>
                      {estaEnVivo(c.fecha, c.inicioMin, c.duracion, zonaAcademia) && (
                        <EnVivoBadge />
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {c.estadoRealizacion !== "PENDIENTE" && (
                      <EstadoRealizacionBadge estado={c.estadoRealizacion} />
                    )}
                    <Badge className={est.badge}>{est.label}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
