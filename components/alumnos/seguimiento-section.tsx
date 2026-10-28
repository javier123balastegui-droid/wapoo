"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  History,
  X,
  Save,
} from "lucide-react";
import {
  crearSeguimientoAction,
  actualizarSeguimientoAction,
  eliminarSeguimientoAction,
  type SeguimientoFormState,
} from "@/app/actions/seguimiento";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fechaLargaES } from "@/lib/fechas";
import type { Seguimiento } from "@/lib/types";

export function SeguimientoSection({
  alumnoId,
  entradas,
}: {
  alumnoId: string;
  entradas: Seguimiento[];
}) {
  // null = cerrado · "nuevo" = alta · Seguimiento = edición de esa entrada
  const [modal, setModal] = useState<null | "nuevo" | Seguimiento>(null);

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <History className="h-5 w-5 text-blush-deep" />
          Ficha evolutiva
        </h2>
        <Button type="button" size="sm" onClick={() => setModal("nuevo")}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      <div className="rule-copper my-4 h-px w-full opacity-60" />

      {entradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          Todavía no hay registros en la ficha evolutiva. Tocá “Agregar” para
          cargar la primera clase: qué tema se dio y cómo se desenvolvió el
          alumno.
        </p>
      ) : (
        <div className="space-y-0">
          {entradas.map((e) => (
            <div
              key={e.id}
              className="relative border-l-2 border-line pb-6 pl-5 last:pb-0"
            >
              <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-blush-deep ring-4 ring-surface" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs capitalize text-ink-muted">
                    {fechaLargaES(e.fecha)}
                  </p>
                  <p className="font-medium text-ink">
                    {e.tema || "Clase"}
                    {e.autorNombre && (
                      <span className="text-xs font-normal text-ink-muted">
                        {" "}
                        · {e.autorNombre}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setModal(e)}
                    aria-label="Editar entrada"
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-blush-soft/60 hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <form
                    action={eliminarSeguimientoAction}
                    onSubmit={(ev) => {
                      if (
                        !window.confirm(
                          "¿Eliminar esta entrada de la ficha evolutiva?",
                        )
                      )
                        ev.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="alumnoId" value={alumnoId} />
                    <button
                      type="submit"
                      aria-label="Eliminar entrada"
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[#fbeaea] hover:text-[#a85d5d]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
              <div className="mt-2 space-y-1.5 text-sm">
                {e.desempeno && (
                  <p>
                    <span className="font-medium text-ink">Desempeño:</span>{" "}
                    <span className="text-ink-soft">{e.desempeno}</span>
                  </p>
                )}
                {e.aReforzar && (
                  <p>
                    <span className="font-medium text-ink">A reforzar:</span>{" "}
                    <span className="text-ink-soft">{e.aReforzar}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalSeguimiento
          title={modal === "nuevo" ? "Nueva entrada" : "Editar entrada"}
          onClose={() => setModal(null)}
        >
          <SeguimientoForm
            alumnoId={alumnoId}
            entrada={modal === "nuevo" ? undefined : modal}
            onDone={() => setModal(null)}
          />
        </ModalSeguimiento>
      )}
    </Card>
  );
}

function ModalSeguimiento({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-3xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ink">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted transition-colors hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function SeguimientoForm({
  alumnoId,
  entrada,
  onDone,
}: {
  alumnoId: string;
  entrada?: Seguimiento;
  onDone: () => void;
}) {
  const action = entrada ? actualizarSeguimientoAction : crearSeguimientoAction;
  const [state, formAction, pending] = useActionState<
    SeguimientoFormState,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="alumnoId" value={alumnoId} />
      {entrada && <input type="hidden" name="id" value={entrada.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Fecha</Label>
          <Input type="date" name="fecha" defaultValue={entrada?.fecha ?? hoy} />
        </div>
        <div className="space-y-1.5">
          <Label>Tema dado</Label>
          <Input
            name="tema"
            defaultValue={entrada?.tema}
            placeholder="Tema de la clase"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cómo se desenvolvió</Label>
        <Textarea
          name="desempeno"
          defaultValue={entrada?.desempeno}
          rows={3}
          placeholder="Desempeño del alumno durante la clase"
        />
      </div>

      <div className="space-y-1.5">
        <Label>A reforzar</Label>
        <Textarea
          name="aReforzar"
          defaultValue={entrada?.aReforzar}
          rows={2}
          placeholder="Qué le costó o en qué conviene hacer énfasis"
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          Cancelar
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Guardar
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
