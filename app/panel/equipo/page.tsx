import { Mail, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getUsuarios } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UsuarioForm } from "@/components/equipo/usuario-form";
import {
  toggleUsuarioActivoAction,
  setTelefonoUsuarioAction,
} from "@/app/actions/equipo";
import { iniciales, cn } from "@/lib/utils";

export default async function EquipoPage() {
  const me = await requireAdmin();
  const usuarios = await getUsuarios();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-cream">Equipo</h1>
        <p className="mt-2 text-cream/85">
          Cuentas con acceso al panel de gestión: administración y profesores.
          No hay registro abierto; las cuentas se crean únicamente desde esta
          sección.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {usuarios.map((u) => (
            <Card key={u.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    u.activo
                      ? "bg-blush-soft text-blush-deep"
                      : "bg-pago-sin-bg text-pago-sin",
                  )}
                >
                  {iniciales(u.nombre)}
                </span>
                <div>
                  <p className="font-medium text-ink">
                    {u.nombre}
                    {u.id === me.id && (
                      <span className="ml-1 text-xs font-normal text-ink-muted">
                        (tu cuenta)
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Mail className="h-3 w-3" />
                    {u.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  className={
                    u.rol === "ADMIN"
                      ? "bg-blush-soft text-blush-deep"
                      : "bg-beige/50 text-ink-soft"
                  }
                >
                  {u.rol === "ADMIN" ? "Administración" : "Profesor/a"}
                </Badge>
                {u.rol === "ADMIN" && u.esProfe && (
                  <Badge className="bg-beige/50 text-ink-soft">Profesor/a</Badge>
                )}
                {!u.activo && (
                  <Badge className="bg-pago-sin-bg text-pago-sin">Inactivo</Badge>
                )}
                {u.id !== me.id && (
                  <form action={toggleUsuarioActivoAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      type="hidden"
                      name="activo"
                      value={u.activo ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-blush-soft/50 hover:text-ink"
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                )}
              </div>
              </div>

              {u.rol === "PROFE" && (
                <form
                  action={setTelefonoUsuarioAction}
                  className="flex items-end gap-2 border-t border-line pt-3"
                >
                  <input type="hidden" name="id" value={u.id} />
                  <div className="flex-1 space-y-1">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                      <Phone className="h-3 w-3" /> WhatsApp del profe (para avisos
                      de clases)
                    </label>
                    <Input
                      name="telefono"
                      defaultValue={u.telefono ?? ""}
                      placeholder="Ej: 5491122334455"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-blush-soft px-4 py-2 text-sm font-medium text-blush-deep transition-colors hover:bg-blush-soft/70"
                  >
                    Guardar
                  </button>
                </form>
              )}
            </Card>
          ))}
        </div>

        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Nuevo usuario
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Cree la cuenta de un profesor o de otro administrador.
          </p>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          <UsuarioForm />
        </Card>
      </div>
    </div>
  );
}
