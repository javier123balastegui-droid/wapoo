"use client";

import { useActionState } from "react";
import { Loader2, Wallet, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ResumenSaldo } from "@/lib/bot/uso";
import {
  registrarCargaSaldoAction,
  type SaldoFormState,
} from "@/app/actions/bot-panel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONSOLA_SALDO = "https://console.anthropic.com/settings/billing";

const usd = (n: number) => `USD ${n.toFixed(2)}`;

/** Saldo, gasto y aviso de recarga. El saldo lo carga la dirección a mano,
 *  porque Claude no lo publica por API. */
export function SaldoBot({ resumen }: { resumen: ResumenSaldo }) {
  const [state, action, pending] = useActionState<SaldoFormState, FormData>(
    registrarCargaSaldoAction,
    undefined,
  );
  const { restante, diasRestantes } = resumen;
  const alerta = diasRestantes !== null && diasRestantes <= 7;

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
            alerta ? "bg-pago-debe-bg text-pago-debe" : "bg-pago-ok-bg text-pago-ok"
          }`}
        >
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-medium text-ink">Saldo y gasto del bot</h2>
          <p className="text-sm text-ink-soft">
            {restante === null
              ? "Anotá abajo cuánto saldo cargaste en Claude y te aviso cuánto queda."
              : `Quedan unos ${usd(restante)}${
                  diasRestantes !== null ? `, para unos ${diasRestantes} días al ritmo actual` : ""
                }.`}
          </p>
        </div>
      </div>

      {alerta && (
        <p className="flex items-start gap-2 rounded-xl bg-pago-debe-bg p-3 text-sm text-pago-debe">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Queda poco saldo: en unos {diasRestantes} días el bot deja de responder.
            Cargá saldo y anotalo acá abajo.
          </span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        <Dato
          titulo="Queda"
          valor={restante === null ? "—" : usd(restante)}
          destacado
        />
        <Dato titulo="Hoy" valor={usd(resumen.gastoHoy)} />
        <Dato titulo="Últimos 7 días" valor={usd(resumen.gastoSemana)} />
        <Dato titulo="Este mes" valor={usd(resumen.gastoMes)} />
        <Dato titulo="Por día" valor={usd(resumen.promedioDiario)} />
      </div>
      <p className="text-xs text-ink-muted">
        {resumen.respuestasSemana} respuestas del bot en los últimos 7 días
        {resumen.respuestasSemana > 0 &&
          ` · ${usd(resumen.gastoSemana / resumen.respuestasSemana)} cada una en promedio`}
        . Son valores estimados con la lista de precios de Claude.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={CONSOLA_SALDO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-blush-deep hover:underline"
        >
          Cargar saldo en Claude <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <form action={action} className="space-y-2 border-t border-line pt-4">
        <Label htmlFor="monto">Anotá una carga de saldo (en dólares)</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="monto"
            name="monto"
            inputMode="decimal"
            placeholder="20"
            required
            className="sm:w-40"
          />
          <Input name="nota" placeholder="Nota (opcional)" className="sm:flex-1" />
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
        {resumen.cargado && (
          <p className="text-xs text-ink-muted">
            Última carga anotada: {usd(resumen.cargado.monto)} el{" "}
            {new Date(resumen.cargado.fecha).toLocaleDateString("es-AR")} · gastado desde
            entonces: {usd(resumen.gastadoDesdeCarga)}
          </p>
        )}
        {state?.error && <p className="text-sm text-pago-debe">{state.error}</p>}
        {state?.ok && (
          <p className="flex items-center gap-1 text-sm text-pago-ok">
            <CheckCircle2 className="h-4 w-4" /> {state.ok}
          </p>
        )}
      </form>
    </Card>
  );
}

function Dato({
  titulo,
  valor,
  destacado = false,
}: {
  titulo: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destacado ? "border-blush-deep bg-blush-soft/30" : "border-line"
      }`}
    >
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className={`font-medium text-ink ${destacado ? "text-lg" : ""}`}>{valor}</p>
    </div>
  );
}
