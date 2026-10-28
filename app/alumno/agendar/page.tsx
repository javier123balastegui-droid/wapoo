import Link from "next/link";
import { ArrowLeft, Clock, Hourglass, XCircle } from "lucide-react";
import { requireAlumno } from "@/lib/portal-auth";
import { getGruposDisponibles, getPreciosPortal } from "@/lib/portal-data";
import { AgendarForm } from "@/components/portal/agendar-form";
import { HoraClase } from "@/components/portal/hora-clase";
import { PedirLugarButton } from "@/components/portal/pedir-lugar-button";
import { Card } from "@/components/ui/card";
import { TIPO_CLASE_META } from "@/lib/constants";
import { fechaLargaES } from "@/lib/fechas";
import { formatMoneda, type Moneda } from "@/lib/utils";
import { getOrganizacion, reglasDe, monedaDe } from "@/lib/organizacion";
import { hoyEn } from "@/lib/fechas";

export default async function AgendarPage() {
  const alumno = await requireAlumno();
  const org = await getOrganizacion(alumno.organizacionId);
  const [grupos, precios] = await Promise.all([
    getGruposDisponibles(alumno.organizacionId, alumno.id),
    getPreciosPortal(alumno.organizacionId),
  ]);
  const hayPrecios =
    precios.valorIndividual > 0 ||
    precios.valorGrupal2 > 0 ||
    precios.valorGrupal3 > 0 ||
    precios.valorSena > 0;

  return (
    <div className="space-y-8 pt-4">
      <div>
        <Link
          href="/alumno/inicio"
          className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a mis clases
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold text-cream">
          Agendar una clase
        </h1>
      </div>

      {hayPrecios && (
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            Precios
          </h2>
          <div className="rule-copper my-3 h-px w-full opacity-60" />
          <ul className="space-y-1.5 text-sm">
            <FilaPrecio
              m={monedaDe(org)}
              label="Clase individual"
              valor={precios.valorIndividual}
            />
            <FilaPrecio
              m={monedaDe(org)}
              label="Grupal de 2 (por alumno)"
              valor={precios.valorGrupal2}
            />
            <FilaPrecio
              m={monedaDe(org)}
              label="Grupal de 3 o más (por alumno)"
              valor={precios.valorGrupal3}
            />
            <FilaPrecio label="Seña para reservar" valor={precios.valorSena} m={monedaDe(org)} />
          </ul>
        </Card>
      )}

      {/* Pedir lugar en una grupal existente */}
      <section>
        <h2 className="mb-1 font-display text-lg font-semibold text-cream">
          Pedí lugar en una clase grupal
        </h2>
        <p className="mb-3 text-sm text-cream/80">
          La academia confirma si hay cupo antes de anotarte. No vas a ver quién
          más está anotado.
        </p>
        {grupos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 p-6 text-center text-sm text-cream/80">
            Por ahora no hay clases grupales abiertas. Podés pedir una nueva
            abajo.
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft"
              >
                <div className="min-w-0">
                  <p className="text-xs capitalize text-ink-muted">
                    {fechaLargaES(g.fecha)} · {TIPO_CLASE_META.GRUPAL.label}
                  </p>
                  <p className="font-medium text-ink">{g.temaTitulo}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-soft">
                    <Clock className="h-3.5 w-3.5 text-blush-deep" />
                    <HoraClase
                      zonaAcademia={org.zonaHoraria}
                      fecha={g.fecha}
                      inicioMin={g.inicioMin}
                      duracion={g.duracion}
                      zona={alumno.zonaHoraria}
                    />
                  </p>
                </div>
                {g.estadoPedido === "PENDIENTE" ? (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pago-sena-bg px-4 text-sm font-medium text-pago-sena">
                    <Hourglass className="h-4 w-4" /> Pendiente de confirmación
                  </span>
                ) : g.estadoPedido === "RECHAZADA" ? (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pago-sin-bg px-4 text-sm font-medium text-pago-sin">
                    <XCircle className="h-4 w-4" /> Sin lugar disponible
                  </span>
                ) : (
                  <PedirLugarButton claseId={g.id} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pedir una clase nueva */}
      <section>
        <h2 className="mb-1 font-display text-lg font-semibold text-cream">
          Pedí una clase nueva
        </h2>
        <p className="mb-3 text-sm text-cream/80">
          Elegí el tipo, el día, el horario y la duración. El profesor lo asigna
          la academia.
        </p>
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <AgendarForm
            zona={alumno.zonaHoraria}
            horarios={org.horariosAtencion}
            reglas={reglasDe(org)}
            zonaAcademia={org.zonaHoraria}
            hoy={hoyEn(org.zonaHoraria)}
          />
        </div>
      </section>
    </div>
  );
}

function FilaPrecio({ label, valor, m }: { label: string; valor: number; m: Moneda }) {
  if (!valor || valor <= 0) return null;
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium text-ink">{formatMoneda(valor, m)}</span>
    </li>
  );
}
