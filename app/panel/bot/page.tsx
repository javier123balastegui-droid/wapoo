import Link from "next/link";
import { MessagesSquare, Bot, UserRound, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarConversacionesBot } from "@/lib/bot/conversaciones";
import { Card } from "@/components/ui/card";
import { getConfigBot } from "@/lib/bot/config";
import { resumenSaldo } from "@/lib/bot/uso";
import { ControlBot } from "@/components/bot/control-bot";
import { SaldoBot } from "@/components/bot/saldo-bot";

// El gasto cambia con cada respuesta del bot: la pantalla se arma siempre
// con los datos del momento, sin guardar una versión vieja.
export const dynamic = "force-dynamic";

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function BotPage() {
  const { organizacionId: orgId } = await requireAdmin();
  const [convs, config, saldo] = await Promise.all([
    listarConversacionesBot(orgId),
    getConfigBot(orgId),
    resumenSaldo(orgId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">Bot</h1>
        <p className="mt-2 text-cream/85">
          Conversaciones del bot de WhatsApp con los alumnos. Podés leer el chat
          y, si hace falta, tomar el control para responder vos (la directora).
        </p>
      </header>

      <ControlBot config={config} />

      <SaldoBot resumen={saldo} />

      {convs.length === 0 ? (
        <Card className="p-10 text-center">
          <MessagesSquare className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-ink-soft">Todavía no hay conversaciones.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {convs.map((c) => (
            <Link
              key={c.id}
              prefetch={false}
              href={`/panel/bot/${c.id}`}
              className="block"
            >
              <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-blush-soft/30">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush-soft text-blush-deep">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink">{c.contacto}</p>
                    {c.estado === "HUMANO" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pago-sena-bg px-2 py-0.5 text-xs font-medium text-pago-sena">
                        <UserRound className="h-3 w-3" /> Con la directora
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pago-ok-bg px-2 py-0.5 text-xs font-medium text-pago-ok">
                        <Bot className="h-3 w-3" /> Bot
                      </span>
                    )}
                  </div>
                  {c.ultimoMensaje && (
                    <p className="mt-0.5 truncate text-sm text-ink-soft">
                      {c.ultimoMensaje}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                  {fechaHora(c.actualizadoEn)}
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
