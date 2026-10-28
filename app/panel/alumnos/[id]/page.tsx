import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  CalendarDays,
  ClipboardList,
  User,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getAlumnoById,
  getReportesDeAlumno,
  getClases,
  getTemas,
  getUsuarios,
  getClasesDeAlumno,
  getSeguimientosDeAlumno,
} from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EliminarAlumnoButton } from "@/components/alumnos/eliminar-alumno-button";
import { SeguimientoSection } from "@/components/alumnos/seguimiento-section";
import { CodigoAccesoAlumno } from "@/components/alumnos/codigo-acceso-alumno";
import { iniciales } from "@/lib/utils";
import { fechaLargaES } from "@/lib/fechas";

export default async function AlumnoPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const alumno = await getAlumnoById(id);
  if (!alumno) notFound();
  const esAdmin = user.rol === "ADMIN";

  const [reportes, clasesDelAlumno, seguimientos] = await Promise.all([
    getReportesDeAlumno(id),
    getClasesDeAlumno(id),
    getSeguimientosDeAlumno(id),
  ]);
  const totalClases = clasesDelAlumno.length;

  // Las tres tablas de una vez y se cruza en memoria. Antes cada reporte pedía
  // su clase, su tema y su profe por separado: el alumno con más historia tiene
  // 95 clases, o sea casi 300 consultas para abrir una ficha.
  //
  // Se traen TODAS las clases y no solo las del alumno, porque un reporte puede
  // ser de una clase de la que después lo sacaron, y así la fecha sigue siendo
  // la de la clase igual que antes.
  const [clasesTodas, temasTodos, usuariosTodos] = await Promise.all([
    getClases(),
    getTemas(),
    getUsuarios(),
  ]);
  const clasePorId = new Map(clasesTodas.map((c) => [c.id, c]));
  const temaPorId = new Map(temasTodos.map((t) => [t.id, t]));
  const usuarioPorId = new Map(usuariosTodos.map((u) => [u.id, u]));

  const historial = reportes
    .map((r) => {
      const clase = clasePorId.get(r.claseId);
      const tema = clase?.temaId ? temaPorId.get(clase.temaId) : undefined;
      const profe = clase?.profeId ? usuarioPorId.get(clase.profeId) : undefined;
      return {
        claseId: r.claseId,
        fecha: clase?.fecha ?? r.creadoEn,
        temaTitulo: tema?.titulo ?? r.temaDado ?? "Clase",
        profe: profe?.nombre ?? "—",
        pa: r.porAlumno.find((x) => x.alumnoId === id),
        observaciones: r.observaciones,
      };
    })
    .filter((h) => h.pa);

  return (
    <div className="space-y-6">
      <Link
        href="/panel/alumnos"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a alumnos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-cream text-xl font-semibold text-blush-deep shadow-soft">
            {iniciales(alumno.nombre)}
          </span>
          <div>
            <h1 className="font-display text-4xl font-semibold text-cream">
              {alumno.nombre}
            </h1>
            <p className="mt-1 text-cream/85">{alumno.carrera}</p>
            {esAdmin && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cream/70">
                {alumno.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {alumno.email}
                  </span>
                )}
                {alumno.telefono && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {alumno.telefono}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/panel/alumnos/editar/${alumno.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="h-4 w-4" /> Editar
          </Link>
          {esAdmin && (
            <EliminarAlumnoButton id={alumno.id} nombre={alumno.nombre} />
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Ficha evolutiva: la cargan y editan profes y admin */}
        <SeguimientoSection alumnoId={alumno.id} entradas={seguimientos} />

        {/* Ficha */}
        <Card className="h-fit p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <User className="h-5 w-5 text-blush-deep" />
            Ficha
          </h2>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-ink-muted">Carrera</dt>
              <dd className="text-ink">{alumno.carrera}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Clases</dt>
              <dd className="flex items-center gap-1.5 text-ink">
                <CalendarDays className="h-3.5 w-3.5 text-blush-deep" />
                {totalClases}
              </dd>
            </div>
            {alumno.notas && (
              <div>
                <dt className="text-xs text-ink-muted">Notas</dt>
                <dd className="whitespace-pre-line text-ink-soft">
                  {alumno.notas}
                </dd>
              </div>
            )}
            {esAdmin && alumno.codigoAcceso && (
              <CodigoAccesoAlumno codigo={alumno.codigoAcceso} />
            )}
          </dl>
        </Card>
      </div>

      {/* Reportes de clases cargados desde la agenda (solo lectura; se editan en la clase) */}
      {historial.length > 0 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <ClipboardList className="h-5 w-5 text-blush-deep" />
            Reportes de clases
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Reportes cargados por los profesores desde la agenda. Para
            modificarlos, abrí el reporte de la clase.
          </p>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          <div className="space-y-0">
            {historial.map((h, i) => (
              <div
                key={`${h.claseId}-${i}`}
                className="relative border-l-2 border-line pb-6 pl-5 last:pb-0"
              >
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-blush-deep ring-4 ring-surface" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs capitalize text-ink-muted">
                      {fechaLargaES(h.fecha)}
                    </p>
                    <p className="font-medium text-ink">
                      {h.temaTitulo}{" "}
                      <span className="text-xs font-normal text-ink-muted">
                        · {h.profe}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/panel/agenda/reporte/${h.claseId}`}
                    aria-label="Editar reporte de la clase"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-blush-soft/60 hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-2 space-y-1.5 text-sm">
                  {h.pa?.queLeCosto && (
                    <p>
                      <span className="font-medium text-ink">
                        Dificultades:
                      </span>{" "}
                      <span className="text-ink-soft">{h.pa.queLeCosto}</span>
                    </p>
                  )}
                  {h.pa?.enfasis && (
                    <p>
                      <span className="font-medium text-ink">A reforzar:</span>{" "}
                      <span className="text-ink-soft">{h.pa.enfasis}</span>
                    </p>
                  )}
                  {h.pa?.loQueMasLeCuesta && (
                    <p>
                      <span className="font-medium text-ink">
                        Mayor dificultad:
                      </span>{" "}
                      <span className="text-ink-soft">
                        {h.pa.loQueMasLeCuesta}
                      </span>
                    </p>
                  )}
                  {h.observaciones && (
                    <p className="text-ink-soft">
                      <span className="font-medium text-ink">
                        Observaciones:
                      </span>{" "}
                      {h.observaciones}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
