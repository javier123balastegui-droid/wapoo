"use client";

import { useActionState } from "react";
import { Loader2, Plus, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  agregarDominioAction,
  guardarWhatsAppAction,
  type FichaState,
} from "@/app/actions/plataforma";

function Aviso({ state }: { state: FichaState }) {
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

export function DominioForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<FichaState, FormData>(agregarDominioAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex gap-2">
        <Input name="dominio" placeholder="otro-dominio.com.ar" aria-label="Dominio nuevo" required />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </Button>
      </div>
      <Aviso state={state} />
    </form>
  );
}

export function WhatsAppForm({ slug, conectado }: { slug: string; conectado: boolean }) {
  const [state, action, pending] = useActionState<FichaState, FormData>(guardarWhatsAppAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Identificador del número</Label>
          <Input name="phoneNumberId" inputMode="numeric" placeholder="1234567890123456" required />
          <p className="text-xs text-ink-muted">Meta → WhatsApp → Configuración de la API (no es el de la cuenta).</p>
        </div>
        <div className="space-y-1.5">
          <Label>Número, como se muestra</Label>
          <Input name="numeroVisible" placeholder="+54 9 11 2233-4455" />
        </div>
      </div>
      <details className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Solo si el número está en la cuenta de Meta de la academia
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          Si el número está en tu cuenta de Meta, dejalos vacíos: se usan los de la plataforma. Si es de la
          cuenta de la academia, hacen falta los dos. Se guardan cifrados y nadie los puede volver a leer
          desde el panel.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Token de acceso</Label>
            <Input name="token" type="password" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>Secreto de la app</Label>
            <Input name="appSecret" type="password" autoComplete="off" />
          </div>
        </div>
      </details>
      <Aviso state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {conectado ? "Cambiar número" : "Conectar número"}
      </Button>
    </form>
  );
}
