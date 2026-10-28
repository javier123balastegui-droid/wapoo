import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ClaseForm } from "@/components/agenda/clase-form";
import { crearClaseAction } from "@/app/actions/agenda";
import { getProfes, getTemas, getAlumnos, getClases } from "@/lib/mock-data";
import { getOrganizacion, reglasDe } from "@/lib/organizacion";
import { zonaDelPanel } from "@/lib/organizacion-peticion";
import { hoyEn } from "@/lib/fechas";

export default async function NuevaClasePage({
  searchParams,
}: {
  searchParams: Promise<{ alumno?: string | string[] }>;
}) {
  const { organizacionId } = await requireAdmin();
  const reglas = reglasDe(await getOrganizacion(organizacionId));
  const sp = await searchParams;
  const alumnoParam = typeof sp.alumno === "string" ? sp.alumno : undefined;

  const [profesRaw, temasRaw, alumnosRaw, clasesRaw] = await Promise.all([
    getProfes(),
    getTemas(),
    getAlumnos(),
    getClases(),
  ]);
  const profes = profesRaw.map((p) => ({ id: p.id, nombre: p.nombre }));
  const temas = temasRaw.map((t) => ({ id: t.id, titulo: t.titulo }));
  const alumnos = alumnosRaw.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    carrera: a.carrera,
  }));
  const clases = clasesRaw.map((c) => ({
    profeId: c.profeId,
    fecha: c.fecha,
    inicioMin: c.inicioMin,
    duracion: c.duracion,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/panel/agenda"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la agenda
      </Link>
      <div>
        <h1 className="font-display text-4xl font-semibold text-cream">
          Nueva clase
        </h1>
        <p className="mt-2 text-cream/85">
          Seleccioná profesor, fecha y duración; luego abrí el panel de horarios
          para asignar uno disponible.
        </p>
      </div>
      <Card className="p-6 sm:p-8">
        <ClaseForm
          reglas={reglas}
          hoy={hoyEn(await zonaDelPanel())}
          action={crearClaseAction}
          profes={profes}
          temas={temas}
          alumnos={alumnos}
          clases={clases}
          initialAlumnoIds={
            alumnoParam && alumnos.some((a) => a.id === alumnoParam)
              ? [alumnoParam]
              : []
          }
        />
      </Card>
    </div>
  );
}
