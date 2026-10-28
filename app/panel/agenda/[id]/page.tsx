import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  User,
  BookOpen,
  GraduationCap,
  Lock,
  ClipboardList,
  Pencil,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getClaseById,
  getTemaById,
  getUserById,
  getAlumnoById,
  getPagoDe,
  getReporteDeClase,
} from "@/lib/mock-data";
import { TIPO_CLASE_META } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { DeleteClaseButton } from "@/components/agenda/delete-clase-button";
import { EstadoRealizacionBadge } from "@/components/agenda/estado-realizacion";
import {
  actualizarPagoAction,
  actualizarEstadoRealizacionAction,
} from "@/app/actions/agenda";
import { minutosAHora, formatMoneda } from "@/lib/utils";
import { fechaLargaES } from "@/lib/fechas";
import { monedaDelPanel } from "@/lib/organizacion-peticion";

export default async function ClaseDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const m = await monedaDelPanel();
  const esAdmin = user.rol === "ADMIN";
  const clase = await getClaseById(id);
  if (!clase) notFound();
  // El profe solo puede ver sus propias clases
  if (!esAdmin && clase.profeId !== user.id) notFound();

  const [tema, profe, reporte, alumnosData] = await Promise.all([
    getTemaById(clase.temaId),
    getUserById(clase.profeId),
    getReporteDeClase(clase.id),
    Promise.all(
      clase.alumnoIds.map(async (aid) => ({
        aid,
        alumno: await getAlumnoById(aid),
        pago: esAdmin ? await getPagoDe(clase.id, aid) : undefined,
      })),
    ),
  ]);
  const tieneReporte = !!reporte;

  return (
    <div className="space-y-6">
      <Link
        href="/panel/agenda"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la agenda
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-4xl font-semibold text-cream">
              {tema?.titulo ?? "Clase"}
            </h1>
            <Badge className="bg-white/15 text-cream">
              {TIPO_CLASE_META[clase.tipo].label}
            </Badge>
            <EstadoRealizacionBadge estado={clase.estadoRealizacion} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm capitalize text-cream/85">
            <span>{fechaLargaES(clase.fecha)}</span>
            <span className="inline-flex items-center gap-1.5 normal-case">
              <Clock className="h-4 w-4" />
              {minutosAHora(clase.inicioMin)}–
              {minutosAHora(clase.inicioMin + clase.duracion)}
            </span>
            <span className="inline-flex items-center gap-1.5 normal-case">
              <User className="h-4 w-4" />
              {profe?.nombre ?? "—"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/panel/agenda/reporte/${clase.id}`}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            <ClipboardList className="h-4 w-4" />
            {tieneReporte ? "Ver / editar reporte" : "Cargar reporte"}
          </Link>
          {esAdmin && (
            <Link
              href={`/panel/agenda/editar/${clase.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="h-4 w-4" /> Editar
            </Link>
          )}
          {esAdmin && <DeleteClaseButton id={clase.id} />}
        </div>
      </header>

      {esAdmin && (
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            ¿Se realizó la clase?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Marcá qué pasó con esta clase. Los profesores lo ven, pero solo
            administración lo edita.
          </p>
          <form
            action={actualizarEstadoRealizacionAction}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="claseId" value={clase.id} />
            <Select
              name="estadoRealizacion"
              defaultValue={clase.estadoRealizacion}
              className="h-9 w-auto"
            >
              <option value="PENDIENTE">Sin marcar</option>
              <option value="REALIZADA">Realizada con normalidad</option>
              <option value="REAGENDADA">Reagendada (avisó con tiempo)</option>
              <option value="CANCELADA">Cancelada a último momento</option>
              <option value="AUSENTE">No avisó / no se conectó</option>
            </Select>
            <Button type="submit" variant="outline" size="sm">
              Guardar
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alumnos */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <GraduationCap className="h-5 w-5 text-blush-deep" />
              Alumnos {esAdmin && "y pagos"}
            </h2>
            {!esAdmin && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Lock className="h-3.5 w-3.5" /> Los pagos los ve solo
                administración
              </span>
            )}
          </div>
          <div className="rule-copper my-4 h-px w-full opacity-60" />

          <ul className="space-y-3">
            {alumnosData.map(({ aid, alumno: a, pago }) => (
                <li
                  key={aid}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-rose/30 p-3"
                >
                  <div>
                    <p className="font-medium text-ink">{a?.nombre ?? "—"}</p>
                    <p className="text-xs text-ink-muted">{a?.carrera}</p>
                  </div>

                  {esAdmin ? (
                    <form
                      action={actualizarPagoAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="claseId" value={clase.id} />
                      <input type="hidden" name="alumnoId" value={aid} />
                      {pago?.monto != null && (
                        <span className="text-sm font-medium text-ink">
                          {formatMoneda(pago.monto, m)}
                        </span>
                      )}
                      <Select
                        name="estado"
                        defaultValue={pago?.estado ?? "SIN_PAGAR"}
                        className="h-9 w-auto"
                      >
                        <option value="SIN_PAGAR">Sin seña</option>
                        <option value="SENADO">Señó</option>
                        <option value="PAGADO">Pagó completo</option>
                      </Select>
                      <Button type="submit" variant="outline" size="sm">
                        Guardar
                      </Button>
                    </form>
                  ) : (
                    <span className="text-xs text-ink-muted">
                      {a?.carrera}
                    </span>
                  )}
                </li>
            ))}
          </ul>
        </Card>

        {/* Material del tema */}
        <Card className="h-fit p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <BookOpen className="h-5 w-5 text-blush-deep" />
            Material
          </h2>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          {tema ? (
            <Link
              href={`/panel/temario/${tema.id}`}
              className="block rounded-2xl border border-line bg-surface-rose/40 p-4 transition-colors hover:border-blush-deep/40 hover:bg-blush-soft/40"
            >
              <p className="font-medium text-ink">{tema.titulo}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                {tema.descripcion || "Ver el material del tema."}
              </p>
              <p className="mt-2 text-xs font-medium text-blush-deep">
                Abrir temario →
              </p>
            </Link>
          ) : (
            <p className="text-sm text-ink-muted">Sin tema asociado.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
