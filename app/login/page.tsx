import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { LoginForm } from "./login-form";
import { marcaDe } from "@/lib/organizacion";
import { requireOrgDeLaPeticion } from "@/lib/organizacion-peticion";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/panel");
  const org = await requireOrgDeLaPeticion();
  const marca = marcaDe(org);

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Panel decorativo (solo escritorio) */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{
          background:
            "radial-gradient(120% 120% at 0% 0%, #f7e7e5 0%, #fbf7f4 45%, #f3e7d6 100%)",
        }}
      >
        <Wordmark marca={marca} />

        <div className="max-w-md">
          <p className="font-display text-[2.6rem] leading-[1.15] text-ink">
            Enseñar {org.materia.toLowerCase() || "con pasión"} con{" "}
            <span className="italic text-blush-deep">claridad</span> y{" "}
            <span className="italic text-blush-deep">calidez</span>.
          </p>
          <p className="mt-5 text-ink-soft">
            Gestioná clases, alumnos, temario y reportes desde un solo lugar,
            prolijo y a tu medida.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="rule-copper h-px w-12" />
          {org.nombre}
          {org.directora && ` · Dir. ${org.directora}`}
        </div>
      </aside>

      {/* Formulario */}
      <section className="flex min-h-screen items-center justify-center bg-cream px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex justify-center lg:hidden">
            <Wordmark marca={marca} />
          </div>

          <h1 className="font-display text-3xl font-semibold text-ink">
            Iniciar sesión
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Acceso para administración y profesores.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
