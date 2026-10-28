import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Palette, Receipt, Globe, MessageCircle, UserCog, X, CheckCircle2, Circle } from "lucide-react";
import {
  getAcademia,
  getMarcaAcademia,
  dominioResponde,
} from "@/lib/plataforma";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import { quitarDominioAction, setAcademiaActivaAction } from "@/app/actions/plataforma";
import { DominioForm, WhatsAppForm } from "@/components/plataforma/ficha-forms";
import { MarcaForm } from "@/components/plataforma/marca-form";
import { PLANTILLAS } from "@/lib/bot/whatsapp";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPlan, historialDe, estaAtrasado } from "@/lib/cobros";
import { PlanForm } from "@/components/plataforma/plan-form";
import { hoyEn, nombreMesAnio, ZONA_ARGENTINA } from "@/lib/fechas";
import { formatMoneda } from "@/lib/utils";

export const metadata = { title: "Academia" };

function Paso({ hecho, children }: { hecho: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-ink-soft">
      {hecho ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pago-ok" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      )}
      <span>{children}</span>
    </li>
  );
}

export default async function AcademiaPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requirePlataforma();
  const { slug } = await params;
  const [a, marca, plan, historial] = await Promise.all([
    getAcademia(slug),
    getMarcaAcademia(slug),
    getPlan(slug),
    historialDe(slug),
  ]);
  if (!a || !marca || !plan) notFound();
  const hoy = hoyEn(ZONA_ARGENTINA);
  const webAbre = a.dominios[0] ? await dominioResponde(a.dominios[0]) : false;
  const dominio = a.dominios[0];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/panel/plataforma"
          className="inline-flex items-center gap-1.5 text-sm text-cream/85 hover:text-cream"
        >
          <ArrowLeft className="h-4 w-4" /> Plataforma
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold text-cream">{a.nombre}</h1>
          {a.activa ? (
            <Badge className="bg-pago-ok-bg text-pago-ok">Activa</Badge>
          ) : (
            <Badge className="bg-pago-sin-bg text-pago-sin">Desactivada</Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-cream/85">
            {a.materia} · identificador <code>{a.slug}</code> · bot {a.modoBot.toLowerCase()}
          </p>
          <Link
            href={`/panel/plataforma/${a.slug}/editar`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="h-4 w-4" /> Editar datos
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
            <Globe className="h-5 w-5" /> Dominios
          </h2>
          {a.dominios.length ? (
            <ul className="space-y-2">
              {a.dominios.map((d) => (
                <li key={d} className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
                  <a href={`https://${d}`} target="_blank" rel="noopener noreferrer" className="text-ink underline-offset-2 hover:underline">
                    {d}
                  </a>
                  <form action={quitarDominioAction}>
                    <input type="hidden" name="slug" value={a.slug} />
                    <input type="hidden" name="dominio" value={d} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Quitar ${d}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">Todavía no tiene dominio: nadie puede entrar a su web.</p>
          )}
          <DominioForm slug={a.slug} />
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
            <MessageCircle className="h-5 w-5" /> WhatsApp
          </h2>
          {a.whatsapp ? (
            <p className="text-sm text-ink-soft">
              Conectado: <span className="text-ink">{a.whatsapp.numeroVisible || "número"}</span> (identificador
              terminado en {a.whatsapp.terminaEn}),{" "}
              {a.whatsapp.cuentaPropia ? "con la cuenta de Meta de la academia" : "en la cuenta de Meta de la plataforma"}.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Sin número: el bot no puede recibir ni mandar mensajes.</p>
          )}
          <WhatsAppForm slug={a.slug} conectado={Boolean(a.whatsapp)} />
        </Card>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <Palette className="h-5 w-5" /> Marca
        </h2>
        <MarcaForm slug={a.slug} nombre={a.nombre} logoUrl={marca.logoUrl} fondo={marca.fondo} acento={marca.acento} />
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <Receipt className="h-5 w-5" /> Plan y cobros
        </h2>
        <PlanForm slug={a.slug} plan={plan} />
        {historial.length > 0 && (
          <ul className="divide-y divide-line border-t border-line pt-2 text-sm">
            {historial.slice(0, 6).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="capitalize text-ink">{nombreMesAnio(c.periodo)}</span>
                <span className="text-ink-soft">
                  {formatMoneda(c.abono, { moneda: c.abonoMoneda, locale: "es-AR" })}
                  {c.excedenteUsd > 0 && ` + ${formatMoneda(c.excedenteUsd, { moneda: "USD", locale: "es-AR" })}`}
                  {" · "}
                  {c.estado === "PAGADO" ? (
                    <span className="text-pago-ok">pagado</span>
                  ) : estaAtrasado(c, hoy) ? (
                    <span className="text-[#a85d5d]">atrasado</span>
                  ) : (
                    <span className="text-pago-sena">pendiente</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/panel/plataforma/cobros" className="text-sm text-ink-soft underline-offset-2 hover:underline">
          Ver todos los cobros
        </Link>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <UserCog className="h-5 w-5" /> Administradores
        </h2>
        {a.admins.length ? (
          <ul className="space-y-1 text-sm text-ink">
            {a.admins.map((x) => (
              <li key={x.email}>
                {x.nombre} · <span className="text-ink-soft">{x.email}</span>
                {!x.activo && <span className="text-ink-muted"> (inactivo)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Sin administradores.</p>
        )}
        <p className="text-xs text-ink-muted">
          El resto del equipo lo da de alta la propia academia desde su panel (Equipo), entrando por su dominio.
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Lo que se hace fuera de la app</h2>
        <ol className="space-y-2.5">
          <Paso hecho={webAbre}>
            <strong className="text-ink">Vercel:</strong>{" "}
            {webAbre ? (
              <>
                la web ya abre en <code>{dominio}</code>.
              </>
            ) : (
              <>
                agregar {dominio ? <code>{dominio}</code> : "el dominio"} en el proyecto (Settings → Domains) y
                apuntar el DNS como indique Vercel. Hasta entonces la web no abre.
              </>
            )}
          </Paso>
          <Paso hecho={Boolean(a.whatsapp)}>
            <strong className="text-ink">Meta:</strong> si el número está en tu cuenta, alcanza con conectarlo acá:
            ya usa el webhook de la plataforma. Si es de la cuenta de la academia, en su app de Meta configurar el
            webhook con <code>https://{dominio ?? "su-dominio"}/api/whatsapp</code>, el token de verificación de la
            plataforma (<code>WHATSAPP_VERIFY_TOKEN</code> en Vercel) y suscribirlo a <code>messages</code>.
          </Paso>
          <Paso hecho={false}>
            <strong className="text-ink">Plantillas:</strong> si es la cuenta de la academia, tiene que tener
            aprobadas las plantillas {Object.values(PLANTILLAS).map((p, i) => (
              <span key={p}>
                {i > 0 && ", "}
                <code>{p}</code>
              </span>
            ))}
            . Sin ellas no salen recordatorios ni avisos.
          </Paso>
          <Paso hecho={a.modoBot === "ENCENDIDO"}>
            <strong className="text-ink">La academia:</strong> entrar por su dominio, cargar precios (Finanzas), el
            link de clase y prender el bot (Bot). Arranca apagado.
          </Paso>
        </ol>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <p className="max-w-xl text-sm text-ink-soft">
          {a.activa
            ? "Desactivarla corta todo: su web da “no encontrado”, el bot deja de atender y los crons la saltean. Los datos quedan."
            : "Está desactivada: no atiende. Al activarla vuelve todo como estaba."}
        </p>
        {a.id === user.organizacionId && a.activa ? (
          <p className="text-sm text-ink-muted">Es la academia de tu cuenta: no se desactiva desde acá.</p>
        ) : (
          <form action={setAcademiaActivaAction}>
            <input type="hidden" name="slug" value={a.slug} />
            <input type="hidden" name="activa" value={a.activa ? "false" : "true"} />
            <Button type="submit" variant={a.activa ? "danger" : "primary"}>
              {a.activa ? "Desactivar academia" : "Activar academia"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
