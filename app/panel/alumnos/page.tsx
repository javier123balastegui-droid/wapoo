import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAlumnos } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { iniciales } from "@/lib/utils";

export default async function AlumnosPage() {
  await requireUser();
  const alumnos = await getAlumnos();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-cream">
            Alumnos
          </h1>
          <p className="mt-2 text-cream/85">
            Las fichas de los alumnos y su historial de evolución.
          </p>
        </div>
        <Link
          href="/panel/alumnos/nuevo"
          className={buttonVariants({ variant: "solid" })}
        >
          <Plus className="h-4 w-4" /> Nuevo alumno
        </Link>
      </header>

      {alumnos.length === 0 ? (
        <Card className="p-10 text-center text-ink-soft">
          Todavía no hay alumnos cargados.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alumnos.map((a) => (
            <Link
              key={a.id}
              prefetch={false}
              href={`/panel/alumnos/${a.id}`}
              className="group"
            >
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blush-soft text-sm font-semibold text-blush-deep">
                  {iniciales(a.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{a.nombre}</p>
                  <p className="truncate text-xs text-ink-muted">{a.carrera}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
