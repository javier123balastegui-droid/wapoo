import { Inbox, Check, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getPedidosUnionPendientes } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aprobarPedidoAction, rechazarPedidoAction } from "@/app/actions/pedidos";
import { fechaLargaES } from "@/lib/fechas";
import { minutosAHora } from "@/lib/utils";

export default async function PedidosPage() {
  await requireAdmin();
  const pedidos = await getPedidosUnionPendientes();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">
          Pedidos
        </h1>
        <p className="mt-2 text-cream/85">
          Alumnos que piden lugar en clases grupales. Consultá con los alumnos ya
          anotados y aprobá para inscribirlo, o rechazá si la clase está llena.
        </p>
      </header>

      {pedidos.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-ink-soft">No hay pedidos pendientes.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => (
            <Card
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {p.alumnoNombre}
                  {p.alumnoCarrera && (
                    <span className="text-xs font-normal text-ink-muted">
                      {" "}
                      · {p.alumnoCarrera}
                    </span>
                  )}
                </p>
                <p className="text-sm text-ink-soft">
                  Pide unirse a:{" "}
                  <span className="font-medium text-ink">{p.temaTitulo}</span>
                </p>
                <p className="text-xs capitalize text-ink-muted">
                  {fechaLargaES(p.fecha)} · {minutosAHora(p.inicioMin)}–
                  {minutosAHora(p.inicioMin + p.duracion)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={aprobarPedidoAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" size="sm">
                    <Check className="h-4 w-4" /> Aprobar
                  </Button>
                </form>
                <form action={rechazarPedidoAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-[#a85d5d] transition-colors hover:bg-[#fbeaea]"
                  >
                    <X className="h-4 w-4" /> Rechazar
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
