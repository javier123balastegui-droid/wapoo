import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { AlumnoForm } from "@/components/alumnos/alumno-form";
import { crearAlumnoAction } from "@/app/actions/alumnos";
import { carrerasActivas } from "@/lib/carreras";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

export default async function NuevoAlumnoPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/panel/alumnos"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a alumnos
      </Link>
      <h1 className="font-display text-4xl font-semibold text-cream">
        Nuevo alumno
      </h1>
      <Card className="p-6 sm:p-8">
        <AlumnoForm
          zonaAcademia={await zonaDelPanel()}
          action={crearAlumnoAction}
          esAdmin={user.rol === "ADMIN"}
          carreras={await carrerasActivas(user.organizacionId)}
        />
      </Card>
    </div>
  );
}
