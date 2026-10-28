import { GraduationCap, Eye, EyeOff, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarCarreras } from "@/lib/carreras";
import {
  cambiarEstadoCarreraAction,
  eliminarCarreraAction,
} from "@/app/actions/carreras";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CarreraNuevaForm } from "@/components/carreras/carrera-nueva-form";

/** Carreras que se ofrecen: se eligen en el alta de alumnos y en el formulario
 *  de inscripción de la web. Solo admin. */
export default async function CarrerasPage() {
  const { organizacionId } = await requireAdmin();
  const carreras = await listarCarreras(organizacionId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">Carreras</h1>
        <p className="mt-2 text-cream/85">
          Las carreras que pueden elegir los alumnos al anotarse y en su ficha.
          Agregá las que quieras, cuando quieras.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <h2 className="font-medium text-ink">Agregar una carrera</h2>
        <CarreraNuevaForm />
      </Card>

      <div className="space-y-3">
        {carreras.map((c) => (
          <Card key={c.id} className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush-soft text-blush-deep">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{c.nombre}</p>
              {!c.activa && (
                <p className="text-xs text-ink-muted">
                  No se ofrece: no aparece para elegir, pero los alumnos que ya la
                  tienen no cambian.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <form action={cambiarEstadoCarreraAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="activa" value={c.activa ? "no" : "si"} />
                <Button type="submit" variant="outline" size="sm">
                  {c.activa ? (
                    <>
                      <EyeOff className="h-4 w-4" /> Dejar de ofrecer
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" /> Volver a ofrecer
                    </>
                  )}
                </Button>
              </form>
              <form action={eliminarCarreraAction}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="outline" size="sm" aria-label={`Borrar ${c.nombre}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
