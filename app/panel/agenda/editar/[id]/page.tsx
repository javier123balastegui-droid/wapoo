import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getClaseById, getProfes, getTemas, getAlumnos } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { EditarClaseForm } from "@/components/agenda/editar-clase-form";
import { actualizarClaseAction } from "@/app/actions/agenda";
import { getOrganizacion, reglasDe } from "@/lib/organizacion";

export default async function EditarClasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organizacionId } = await requireAdmin();
  const reglas = reglasDe(await getOrganizacion(organizacionId));
  const { id } = await params;
  const [clase, profesRaw, temasRaw, alumnosRaw] = await Promise.all([
    getClaseById(id),
    getProfes(),
    getTemas(),
    getAlumnos(),
  ]);
  if (!clase) notFound();

  const profes = profesRaw.map((p) => ({ id: p.id, nombre: p.nombre }));
  const temas = temasRaw.map((t) => ({ id: t.id, titulo: t.titulo }));
  const alumnos = alumnosRaw.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    carrera: a.carrera,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/panel/agenda/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la clase
      </Link>
      <div>
        <h1 className="font-display text-4xl font-semibold text-cream">
          Editar clase
        </h1>
        <p className="mt-2 text-cream/85">
          Asigná el profesor y el tema, cambiá los alumnos, o ajustá el tipo, el
          día y el horario.
        </p>
      </div>
      <Card className="p-6 sm:p-8">
        <EditarClaseForm
          reglas={reglas}
          action={actualizarClaseAction}
          clase={clase}
          profes={profes}
          temas={temas}
          alumnos={alumnos}
        />
      </Card>
    </div>
  );
}
