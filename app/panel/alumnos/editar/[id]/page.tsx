import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAlumnoById } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { AlumnoForm } from "@/components/alumnos/alumno-form";
import { actualizarAlumnoAction } from "@/app/actions/alumnos";
import { carrerasActivas } from "@/lib/carreras";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

export default async function EditarAlumnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const alumno = await getAlumnoById(id);
  if (!alumno) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/panel/alumnos/${alumno.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la ficha
      </Link>
      <h1 className="font-display text-4xl font-semibold text-cream">
        Editar alumno
      </h1>
      <Card className="p-6 sm:p-8">
        <AlumnoForm
          zonaAcademia={await zonaDelPanel()}
          action={actualizarAlumnoAction}
          alumno={alumno}
          esAdmin={user.rol === "ADMIN"}
          carreras={await carrerasActivas(user.organizacionId)}
        />
      </Card>
    </div>
  );
}
