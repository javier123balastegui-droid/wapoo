import {
  Mail,
  GraduationCap,
  MessageSquare,
  UserPlus,
  Inbox,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSolicitudes } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { buttonVariants, type ButtonVariant } from "@/components/ui/button";
import { ESTADO_SOLICITUD_META, PREFERENCIA_META } from "@/lib/constants";
import { fechaCorta } from "@/lib/utils";
import {
  cambiarEstadoSolicitudAction,
  convertirSolicitudAction,
} from "@/app/actions/solicitudes";
import { EliminarSolicitudButton } from "@/components/solicitudes/eliminar-solicitud-button";
import type { EstadoSolicitud } from "@/lib/types";

export default async function SolicitudesPage() {
  await requireAdmin();
  const solicitudes = await getSolicitudes();
  const nuevas = solicitudes.filter((s) => s.estado === "NUEVA").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">
          Solicitudes
        </h1>
        <p className="mt-2 text-cream/85">
          Inscripciones recibidas a través del formulario público.
          {nuevas > 0 && ` Hay ${nuevas} sin revisar.`}
        </p>
      </header>

      {solicitudes.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-ink-soft">Todavía no llegaron solicitudes.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((s) => {
            const meta = ESTADO_SOLICITUD_META[s.estado];
            const cerrada =
              s.estado === "CONVERTIDA" || s.estado === "DESCARTADA";
            return (
              <Card key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{s.nombre}</p>
                      <Badge className={meta.badge}>
                        <Dot className={meta.dot} />
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {s.contacto}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5" />
                        {s.carrera}
                      </span>
                      <span>{PREFERENCIA_META[s.preferencia].label}</span>
                      {s.temaInteres && <span>Interés: {s.temaInteres}</span>}
                    </div>
                    {s.mensaje && (
                      <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-soft">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="italic">“{s.mensaje}”</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {fechaCorta(s.creadoEn)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  {!cerrada && (
                    <form action={convertirSolicitudAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className={buttonVariants({
                          variant: "primary",
                          size: "sm",
                        })}
                      >
                        <UserPlus className="h-4 w-4" /> Convertir en alumno +
                        clase
                      </button>
                    </form>
                  )}
                  {s.estado === "NUEVA" && (
                    <EstadoBtn
                      id={s.id}
                      estado="CONTACTADA"
                      label="Marcar contactada"
                      variant="outline"
                    />
                  )}
                  {s.estado !== "DESCARTADA" && (
                    <EstadoBtn
                      id={s.id}
                      estado="DESCARTADA"
                      label="Descartar"
                      variant="ghost"
                    />
                  )}
                  {cerrada && (
                    <EstadoBtn
                      id={s.id}
                      estado="NUEVA"
                      label="Reabrir"
                      variant="ghost"
                    />
                  )}
                  <EliminarSolicitudButton id={s.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EstadoBtn({
  id,
  estado,
  label,
  variant,
}: {
  id: string;
  estado: EstadoSolicitud;
  label: string;
  variant: ButtonVariant;
}) {
  return (
    <form action={cambiarEstadoSolicitudAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button type="submit" className={buttonVariants({ variant, size: "sm" })}>
        {label}
      </button>
    </form>
  );
}
