import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getClaseById,
  getAlumnoById,
  getTemaById,
  getReporteDeClase,
} from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import {
  ReporteForm,
  type ReportePrevio,
} from "@/components/reportes/reporte-form";
import { guardarReporteAction } from "@/app/actions/reportes";
import { fechaLargaES } from "@/lib/fechas";
import { minutosAHora } from "@/lib/utils";

export default async function ReporteClasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const clase = await getClaseById(id);
  if (!clase) notFound();
  if (user.rol !== "ADMIN" && clase.profeId !== user.id) notFound();

  const [tema, alumnos, rep] = await Promise.all([
    getTemaById(clase.temaId),
    Promise.all(
      clase.alumnoIds.map(async (aid) => {
        const a = await getAlumnoById(aid);
        return { id: aid, nombre: a?.nombre ?? "—", carrera: a?.carrera ?? "" };
      }),
    ),
    getReporteDeClase(id),
  ]);
  const previo: ReportePrevio | null = rep
    ? {
        metodo: rep.metodo,
        temaDado: rep.temaDado,
        observaciones: rep.observaciones,
        porAlumno: Object.fromEntries(
          rep.porAlumno.map((pa) => [
            pa.alumnoId,
            {
              queLeCosto: pa.queLeCosto,
              enfasis: pa.enfasis,
              loQueMasLeCuesta: pa.loQueMasLeCuesta,
            },
          ]),
        ),
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/panel/agenda/${clase.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la clase
      </Link>
      <div>
        <h1 className="font-display text-4xl font-semibold text-cream">
          {rep ? "Editar reporte" : "Cargar reporte"}
        </h1>
        <p className="mt-2 capitalize text-cream/85">
          {tema?.titulo} · {fechaLargaES(clase.fecha)} ·{" "}
          <span className="normal-case">
            {minutosAHora(clase.inicioMin)}–
            {minutosAHora(clase.inicioMin + clase.duracion)}
          </span>
        </p>
      </div>
      <Card className="p-6 sm:p-8">
        <ReporteForm
          action={guardarReporteAction}
          claseId={clase.id}
          alumnos={alumnos}
          temaTitulo={tema?.titulo ?? ""}
          previo={previo}
        />
      </Card>
    </div>
  );
}
