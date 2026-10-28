import { CalendarOff, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarDiasSinClase } from "@/lib/disponibilidad";
import { hoyEn } from "@/lib/fechas";
import { quitarDiaSinClaseAction } from "@/app/actions/dias-sin-clase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiaSinClaseForm } from "@/components/dias/dia-sin-clase-form";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

export const dynamic = "force-dynamic";

function fechaLarga(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Días en los que no se da clase: el bot no agenda y la web no ofrece horarios. */
export default async function DiasSinClasePage() {
  const { organizacionId: orgId } = await requireAdmin();
  const hoy = hoyEn(await zonaDelPanel());
  const dias = await listarDiasSinClase(orgId, hoy);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">Días sin clase</h1>
        <p className="mt-2 text-cream/85">
          Días en los que no se dan clases: un feriado, un viaje, el profe que se
          toma el día. El bot no agenda ahí y en la web del alumno no aparecen
          horarios. Las clases que ya estaban agendadas no se tocan.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <h2 className="font-medium text-ink">Agregar</h2>
        <DiaSinClaseForm hoy={hoy} />
      </Card>

      {dias.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarOff className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-ink-soft">
            No hay días cargados: se da clase todos los días de atención.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {dias.map((d) => (
            <Card key={d.fecha} className="flex items-center gap-4 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush-soft text-blush-deep">
                <CalendarOff className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink first-letter:uppercase">
                  {fechaLarga(d.fecha)}
                </p>
                {d.motivo && <p className="truncate text-sm text-ink-soft">{d.motivo}</p>}
              </div>
              <form action={quitarDiaSinClaseAction}>
                <input type="hidden" name="fecha" value={d.fecha} />
                <Button type="submit" variant="outline" size="sm" aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
