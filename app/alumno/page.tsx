import { redirect } from "next/navigation";
import { getAlumnoSesion } from "@/lib/portal-auth";
import { IngresoForm } from "@/components/portal/ingreso-form";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";

export async function generateMetadata() {
  const org = await orgDeLaPeticion();
  return { title: org ? `Acceso de alumnos — ${org.nombre}` : "Acceso de alumnos" };
}

export default async function AlumnoAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const alumno = await getAlumnoSesion();
  if (alumno) redirect("/alumno/inicio");

  const sp = await searchParams;
  const codigoInicial = typeof sp.codigo === "string" ? sp.codigo : "";

  return (
    <div className="mx-auto max-w-md pt-8 sm:pt-12">
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Acceso de alumnos
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Ingresá el código personal que te dio la academia para ver tus clases
          y su estado.
        </p>
        <div className="mt-5">
          <IngresoForm codigoInicial={codigoInicial} />
        </div>
      </div>
    </div>
  );
}
