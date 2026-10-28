import Link from "next/link";
import { Plus, Receipt, Globe, MessageCircle, UserCog, Bot, ChevronRight } from "lucide-react";
import {
  listarAcademias,
  type ResumenAcademia,
} from "@/lib/plataforma";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { atrasosPorAcademia } from "@/lib/cobros";
import { hoyEn, ZONA_ARGENTINA } from "@/lib/fechas";

export const metadata = { title: "Plataforma" };

/** Qué le falta a una academia para atender. */
function pendientes(a: ResumenAcademia): string[] {
  const p: string[] = [];
  if (!a.dominios.length) p.push("dominio");
  if (!a.whatsapp) p.push("número de WhatsApp");
  if (!a.admins.some((x) => x.activo)) p.push("administrador");
  if (a.modoBot !== "ENCENDIDO") p.push("prender el bot");
  return p;
}

export default async function PlataformaPage() {
  await requirePlataforma();
  const [academias, atrasos] = await Promise.all([
    listarAcademias(),
    atrasosPorAcademia(hoyEn(ZONA_ARGENTINA)),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-cream">Plataforma</h1>
          <p className="mt-2 text-cream/85">
            Las academias que usan el sistema. Solo lo ven los administradores de la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/plataforma/cobros" className={buttonVariants({ variant: "outline" })}>
            <Receipt className="h-4 w-4" /> Cobros
          </Link>
          <Link href="/panel/plataforma/nueva" className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" /> Nueva academia
          </Link>
        </div>
      </header>

      <div className="space-y-3">
        {academias.map((a) => {
          const faltan = pendientes(a);
          return (
            <Link key={a.id} href={`/panel/plataforma/${a.slug}`} prefetch={false} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-4 p-5 transition-shadow hover:shadow-lift">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-xl font-semibold text-ink">{a.nombre}</p>
                    {!a.activa && <Badge className="bg-pago-sin-bg text-pago-sin">Desactivada</Badge>}
                    {(atrasos.get(a.id) ?? 0) > 0 && (
                      <Badge className="bg-[#fbeaea] text-[#a85d5d]">
                        Debe {atrasos.get(a.id)} mes{atrasos.get(a.id) === 1 ? "" : "es"}
                      </Badge>
                    )}
                    {a.activa && faltan.length === 0 && (
                      <Badge className="bg-pago-ok-bg text-pago-ok">Atendiendo</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" />
                      {a.dominios[0] ?? "sin dominio"}
                      {a.dominios.length > 1 && ` (+${a.dominios.length - 1})`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {a.whatsapp ? a.whatsapp.numeroVisible || `…${a.whatsapp.terminaEn}` : "sin número"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <UserCog className="h-3.5 w-3.5" />
                      {a.admins.length} admin{a.admins.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bot className="h-3.5 w-3.5" />
                      bot {a.modoBot.toLowerCase()}
                    </span>
                  </div>
                  {a.activa && faltan.length > 0 && (
                    <p className={cn("text-xs text-pago-sena")}>Falta: {faltan.join(", ")}.</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
