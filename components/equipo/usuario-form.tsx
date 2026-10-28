"use client";

import { useActionState } from "react";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { crearUsuarioAction, type UsuarioFormState } from "@/app/actions/equipo";

export function UsuarioForm() {
  const [state, action, pending] = useActionState<UsuarioFormState, FormData>(
    crearUsuarioAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre" error={state?.errors?.nombre}>
        <Input name="nombre" placeholder="Nombre y apellido" required />
      </Field>

      <Field label="Rol">
        <Select name="rol" defaultValue="PROFE">
          <option value="PROFE">Profesor/a</option>
          <option value="ADMIN">Administrador/a</option>
        </Select>
      </Field>

      <Field label="Email" error={state?.errors?.email}>
        <Input name="email" type="email" placeholder="cuenta@email.com" required />
      </Field>

      <Field label="Contraseña" error={state?.errors?.password}>
        <Input
          name="password"
          type="password"
          placeholder="Mínimo 6 caracteres"
          required
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

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creando…
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" /> Crear usuario
          </>
        )}
      </Button>
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
