import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  UserRound,
  Hand,
  RotateCcw,
  FileText,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getConversacionBotDetalle } from "@/lib/bot/conversaciones";
import { cambiarEstadoBotAction } from "@/app/actions/bot-panel";
import { ResponderForm } from "@/components/bot/responder-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function BotDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organizacionId: orgId } = await requireAdmin();
  const { id } = await params;
  const conv = await getConversacionBotDetalle(orgId, id);
  if (!conv) notFound();

  const enHumano = conv.estado === "HUMANO";

  return (
    <div className="space-y-6">
      <Link
        href="/panel/bot"
        className="inline-flex items-center gap-1.5 text-sm text-cream/85 hover:text-cream"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a las conversaciones
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-cream">
            {conv.contacto}
          </h1>
          <p className="mt-1 text-sm text-cream/85">
            {enHumano
              ? "Esta conversación la estás atendiendo vos. El bot no responde."
              : "El bot está respondiendo esta conversación."}
          </p>
        </div>
        <form action={cambiarEstadoBotAction}>
          <input type="hidden" name="id" value={conv.id} />
          <input type="hidden" name="estado" value={enHumano ? "BOT" : "HUMANO"} />
          {enHumano ? (
            <Button type="submit" variant="outline" size="sm">
              <RotateCcw className="h-4 w-4" /> Devolver al bot
            </Button>
          ) : (
            <Button type="submit" size="sm">
              <Hand className="h-4 w-4" /> Tomar el control
            </Button>
          )}
        </form>
      </header>

      {enHumano && (
        <Card className="space-y-3 bg-pago-sena-bg/50 p-4">
          <p className="text-sm text-ink-soft">
            El bot no responde <strong>en esta conversación</strong>; con el
            resto de los alumnos sigue trabajando normal. Escribile vos desde
            acá, y cuando termines tocá &ldquo;Devolver al bot&rdquo;.
          </p>
          <ResponderForm
            conversacionId={conv.id}
            ventanaAbierta={conv.ventanaAbierta}
            ultimoEntranteEn={conv.ultimoEntranteEn}
          />
        </Card>
      )}

      <Card className="space-y-3 p-4">
        {conv.mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Sin mensajes todavía.
          </p>
        ) : (
          conv.mensajes.map((m, i) => {
            const esAlumno = m.rol === "user";
            return (
              <div
                key={i}
                className={`flex ${esAlumno ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    esAlumno
                      ? "bg-cream text-ink shadow-sm"
                      : m.origen === "HUMANO"
                        ? "bg-ink text-cream"
                        : "bg-[#AE6675] text-cream"
                  }`}
                >
                  <div
                    className={`mb-0.5 flex items-center gap-1 text-xs ${
                      esAlumno ? "text-ink-muted" : "text-cream/80"
                    }`}
                  >
                    {esAlumno ? (
                      <>
                        <UserRound className="h-3 w-3" /> Alumno
                      </>
                    ) : m.origen === "HUMANO" ? (
                      <>
                        <Hand className="h-3 w-3" /> Vos
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3" /> Bot
                      </>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{m.contenido}</p>
                  {m.adjunto &&
                    (m.adjunto.tipo.startsWith("image/") ? (
                      <a
                        href={m.adjunto.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block"
                        title="Abrir el comprobante en tamaño completo"
                      >
                        {/* Enlace firmado de Supabase que vence solo: next/image
                            no aporta nada acá y pediría configurar el dominio. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.adjunto.url}
                          alt="Comprobante enviado por el alumno"
                          className="max-h-72 rounded-lg border border-ink/10"
                        />
                      </a>
                    ) : (
                      <a
                        href={m.adjunto.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-blush-soft"
                      >
                        <FileText className="h-4 w-4" /> Ver comprobante (PDF)
                      </a>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
