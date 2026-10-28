import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { getAlumnoSesion } from "@/lib/portal-auth";
import { salirAlumnoAction } from "@/app/actions/portal";
import { marcaDe } from "@/lib/organizacion";
import { requireOrgDeLaPeticion } from "@/lib/organizacion-peticion";

export default async function AlumnoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const alumno = await getAlumnoSesion();
  const org = await requireOrgDeLaPeticion();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark marca={marcaDe(org)} light />
        {alumno && (
          <form action={salirAlumnoAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </form>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">{children}</main>
    </div>
  );
}
