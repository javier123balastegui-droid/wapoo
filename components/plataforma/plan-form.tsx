"use client";

import { useActionState } from "react";
import { Loader2, Save, AlertCircle, CheckCircle2, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { guardarPlanAction, generarCobrosAction, type PlanState } from "@/app/actions/cobros";
import { MONEDAS_ABONO } from "@/lib/paises";

function Aviso({ state }: { state: PlanState }) {
  if (state?.error)
    return (
      <p role="alert" className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-pago-ok-bg px-3 py-2.5 text-sm text-pago-ok">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {state.ok}
      </p>
    );
  return null;
}

export function PlanForm({
  slug,
  plan,
}: {
  slug: string;
  plan: { abonoMonto: number; abonoMoneda: string; botTopeUsd: number; excedenteFactor: number; sinCargo: boolean };
}) {
  const [state, action, pending] = useActionState<PlanState, FormData>(guardarPlanAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Abono mensual</Label>
          <div className="flex gap-2">
            <Input name="abonoMonto" type="number" min={0} step="0.01" defaultValue={plan.abonoMonto} required />
            <Select name="abonoMoneda" defaultValue={plan.abonoMoneda} className="w-28" aria-label="Moneda del abono">
              {MONEDAS_ABONO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Bot incluido hasta (USD por mes)</Label>
          <Input name="botTopeUsd" type="number" min={0} step="0.5" defaultValue={plan.botTopeUsd} required />
          <p className="text-xs text-ink-muted">Lo que gasta el bot en Anthropic. Hasta acá, va en el abono.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Excedente: costo ×</Label>
          <Input name="excedenteFactor" type="number" min={1} step="0.1" defaultValue={plan.excedenteFactor} required />
          <p className="text-xs text-ink-muted">Lo que pase del tope se cobra al costo por este número (2 = el doble).</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm text-ink">
          <input type="checkbox" name="sinCargo" defaultChecked={plan.sinCargo} className="h-4 w-4" />
          Sin cargo (no genera resúmenes)
        </label>
      </div>
      <Aviso state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar plan
      </Button>
    </form>
  );
}

export function GenerarCobrosForm({ periodo, etiqueta }: { periodo: string; etiqueta: string }) {
  const [state, action, pending] = useActionState<PlanState, FormData>(generarCobrosAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="periodo" value={periodo} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
        Armar o actualizar los resúmenes de {etiqueta}
      </Button>
      <Aviso state={state} />
    </form>
  );
}
