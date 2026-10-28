"use client";

import { useActionState } from "react";
import { Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  crearSolicitudAction,
  type InscripcionState,
} from "@/app/actions/solicitudes";

export function InscripcionForm({ carreras }: { carreras: string[] }) {
  const [state, action, pending] = useActionState<InscripcionState, FormData>(
    crearSolicitudAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-12 w-12 text-pago-ok" />
        <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
          ¡Gracias por inscribirte!
        </h3>
        <p className="mt-2 text-ink-soft">
          Recibimos tus datos. Te vamos a contactar muy pronto para coordinar.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Tu nombre" error={state?.errors?.nombre}>
        <Input name="nombre" placeholder="Nombre y apellido" required />
      </Field>

      <Field label="Email o WhatsApp" error={state?.errors?.contacto}>
        <Input name="contacto" placeholder="¿Cómo te contactamos?" required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carrera">
          <Select name="carrera" defaultValue={carreras[0]}>
            {carreras.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="¿Grupal o individual?">
          <Select name="preferencia" defaultValue="INDISTINTO">
            <option value="INDISTINTO">Me da igual</option>
            <option value="GRUPAL">Grupal</option>
            <option value="INDIVIDUAL">Individual</option>
          </Select>
        </Field>
      </div>

      <Field label="Tema o clase de interés">
        <Input name="temaInteres" placeholder="Ej: Cráneo, Sistema nervioso…" />
      </Field>

      <Field label="Mensaje (opcional)">
        <Textarea
          name="mensaje"
          rows={3}
          placeholder="Escribí tu consulta o comentario"
        />
      </Field>

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Enviar inscripción
          </>
        )}
      </Button>
      <p className="text-center text-xs text-ink-muted">
        Sin cuenta ni contraseña. Solo te contactamos.
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-[#a85d5d]">{error}</p>}
    </div>
  );
}
