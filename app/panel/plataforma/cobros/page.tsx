import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import {
  listarCobros,
  consumoDelMes,
  estaAtrasado,
  excedenteUsd,
  mesAnterior,
  mesEnCurso,
  DIA_DE_VENCIMIENTO,
  type Cobro,
} from "@/lib/cobros";
import { listarAcademias } from "@/lib/plataforma";
import { getPlan } from "@/lib/cobros";
import { marcarCobroAction } from "@/app/actions/cobros";
import { GenerarCobrosForm } from "@/components/plataforma/plan-form";
import { hoyEn, nombreMesAnio, sumarMes, ZONA_ARGENTINA } from "@/lib/fechas";
import { formatMoneda } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Cobros" };

const usd = (n: number) => formatMoneda(n, { moneda: "USD", locale: "es-AR" });

export default async function CobrosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requirePlataforma();
  const sp = await searchParams;
  const enCurso = mesEnCurso();
  const periodo = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) && sp.mes < enCurso ? sp.mes : mesAnterior();
  const hoy = hoyEn(ZONA_ARGENTINA);

  const [cobros, academias, consumo] = await Promise.all([
    listarCobros(periodo),
    listarAcademias(),
    consumoDelMes(enCurso),
  ]);
  const planes = await Promise.all(academias.map(async (a) => ({ a, plan: await getPlan(a.slug) })));
  const pendiente = cobros.filter((c) => c.estado === "PENDIENTE");

  return (
    <div className="space-y-6">
      <header>
        <Link href="/panel/plataforma" className="inline-flex items-center gap-1.5 text-sm text-cream/85 hover:text-cream">
          <ArrowLeft className="h-4 w-4" /> Plataforma
        </Link>
        <h1 className="mt-2 font-display text-4xl font-semibold text-cream">Cobros</h1>
        <p className="mt-2 text-cream/85">
          Un resumen por academia y por mes: el abono y, si el bot pasó su tope, el excedente en dólares.
          Se cobra a mano y se marca acá. Cada resumen vence el día {DIA_DE_VENCIMIENTO} del mes siguiente;
          desde el día después figura como atrasado.
        </p>
      </header>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/panel/plataforma/cobros?mes=${sumarMes(periodo, -1)}`} prefetch={false} aria-label="Mes anterior" className="rounded-full p-2 hover:bg-blush-soft/60">
              <ChevronLeft className="h-5 w-5 text-ink" />
            </Link>
            <h2 className="font-display text-2xl font-semibold capitalize text-ink">{nombreMesAnio(periodo)}</h2>
            {sumarMes(periodo, 1) < enCurso && (
              <Link href={`/panel/plataforma/cobros?mes=${sumarMes(periodo, 1)}`} prefetch={false} aria-label="Mes siguiente" className="rounded-full p-2 hover:bg-blush-soft/60">
                <ChevronRight className="h-5 w-5 text-ink" />
              </Link>
            )}
          </div>
          <p className="text-sm text-ink-soft">
            {cobros.length} {cobros.length === 1 ? "resumen" : "resúmenes"} · {pendiente.length} pendiente{pendiente.length === 1 ? "" : "s"}
          </p>
        </div>

        <GenerarCobrosForm periodo={periodo} etiqueta={nombreMesAnio(periodo)} />

        {cobros.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay resúmenes de este mes.</p>
        ) : (
          <ul className="divide-y divide-line">
            {cobros.map((c) => (
              <FilaCobro key={c.id} c={c} atrasado={estaAtrasado(c, hoy)} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Bot en <span className="capitalize">{nombreMesAnio(enCurso)}</span> (en curso)
        </h2>
        <p className="text-sm text-ink-soft">Lo que lleva gastado cada academia este mes, contra su tope.</p>
        <ul className="divide-y divide-line text-sm">
          {planes.map(({ a, plan }) => {
            const gasto = consumo.get(a.id) ?? 0;
            const pasa = plan && !plan.sinCargo ? excedenteUsd(gasto, plan) : 0;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-ink">
                  {a.nombre}
                  {plan?.sinCargo && <span className="text-ink-muted"> · sin cargo</span>}
                  {!a.activa && <span className="text-ink-muted"> · desactivada</span>}
                </span>
                <span className="text-ink-soft">
                  {usd(gasto)}
                  {plan && !plan.sinCargo && ` de ${usd(plan.botTopeUsd)} incluidos`}
                  {pasa > 0 && <span className="text-pago-sena"> · excedente a cobrar {usd(pasa)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function FilaCobro({ c, atrasado }: { c: Cobro; atrasado: boolean }) {
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/panel/plataforma/${c.slug}`} prefetch={false} className="font-medium text-ink hover:underline">
            {c.nombre}
          </Link>
          {c.estado === "PAGADO" ? (
            <Badge className="bg-pago-ok-bg text-pago-ok">Pagado</Badge>
          ) : atrasado ? (
            <Badge className="bg-[#fbeaea] text-[#a85d5d]">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Atrasado
            </Badge>
          ) : (
            <Badge className="bg-pago-sena-bg text-pago-sena">Pendiente</Badge>
          )}
        </div>
        <p className="text-sm text-ink">
          {formatMoneda(c.abono, { moneda: c.abonoMoneda, locale: "es-AR" })}
          {c.excedenteUsd > 0 && <span> + {usd(c.excedenteUsd)} de excedente</span>}
        </p>
      </div>
      <p className="text-xs text-ink-muted">
        Bot: {usd(c.botCostoUsd)} de {usd(c.botTopeUsd)} incluidos
        {c.pagadoEn && ` · pagado el ${new Date(c.pagadoEn).toLocaleDateString("es-AR")}`}
      </p>
      <form action={marcarCobroAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="slug" value={c.slug} />
        <input type="hidden" name="pagado" value={c.estado === "PAGADO" ? "false" : "true"} />
        <Input name="nota" defaultValue={c.nota} placeholder="Nota (ej: transferencia del 5/11)" className="h-9 max-w-xs" />
        <Button type="submit" size="sm" variant={c.estado === "PAGADO" ? "ghost" : "primary"}>
          {c.estado === "PAGADO" ? "Volver a pendiente" : "Marcar pagado"}
        </Button>
      </form>
    </li>
  );
}
