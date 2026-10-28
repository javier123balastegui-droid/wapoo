import Link from "next/link";
import { BookOpen, Plus, FileText, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTemas } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { fechaCorta } from "@/lib/utils";

export default async function TemarioPage() {
  const user = await requireUser();
  const esAdmin = user.rol === "ADMIN";
  const temas = await getTemas();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-cream">Temario</h1>
          <p className="mt-2 max-w-xl text-cream/85">
            {esAdmin
              ? "Gestioná los temas y su material para unificar el contenido que dictan todos los profesores."
              : "Temas y material de referencia, en modo de solo lectura."}
          </p>
        </div>
        {esAdmin && (
          <Link
            href="/panel/temario/nuevo"
            className={buttonVariants({ variant: "solid" })}
          >
            <Plus className="h-4 w-4" /> Nuevo tema
          </Link>
        )}
      </header>

      {temas.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-ink-soft">Todavía no hay temas cargados.</p>
          {esAdmin && (
            <Link
              href="/panel/temario/nuevo"
              className={buttonVariants({ variant: "primary", className: "mt-4" })}
            >
              <Plus className="h-4 w-4" /> Crear el primero
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {temas.map((t) => (
            <Link
              key={t.id}
              prefetch={false}
              href={`/panel/temario/${t.id}`}
              className="group"
            >
              <Card className="flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blush-soft/70 text-blush-deep">
                    <BookOpen className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                  {t.titulo}
                </h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-ink-soft">
                  {t.descripcion || "Sin descripción."}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                  <FileText className="h-3.5 w-3.5" />
                  {t.recursos.length}{" "}
                  {t.recursos.length === 1 ? "material" : "materiales"}
                  <span>·</span>
                  <span>act. {fechaCorta(t.actualizadoEn)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
