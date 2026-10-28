"use client";

import { useState } from "react";
import { Plus, X, Link2, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Recurso } from "@/lib/types";

const selectClass =
  "h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:border-blush-deep focus:outline-none focus:ring-2 focus:ring-blush-deep/20";

export function RecursosEditor({
  name,
  initial,
}: {
  name: string;
  initial: Recurso[];
}) {
  const [items, setItems] = useState<Recurso[]>(initial);

  function update(i: number, patch: Partial<Recurso>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { id: `r-${Date.now()}`, titulo: "", tipo: "enlace", url: "" },
    ]);
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      {/* El valor se envía como JSON en un campo oculto */}
      <input type="hidden" name={name} value={JSON.stringify(items)} readOnly />

      {items.length === 0 && (
        <p className="text-sm text-ink-muted">
          Sin material todavía. Agregá enlaces o archivos de referencia.
        </p>
      )}

      {items.map((it, i) => (
        <div
          key={it.id}
          className="flex flex-col gap-2 rounded-xl border border-line bg-surface-rose/40 p-3 sm:flex-row sm:items-center"
        >
          <select
            value={it.tipo}
            onChange={(e) =>
              update(i, { tipo: e.target.value as Recurso["tipo"] })
            }
            className={selectClass}
            aria-label="Tipo de material"
          >
            <option value="enlace">Enlace</option>
            <option value="archivo">Archivo</option>
          </select>

          <Input
            value={it.titulo}
            onChange={(e) => update(i, { titulo: e.target.value })}
            placeholder="Nombre del material (ej: Lámina del cráneo)"
            className="flex-1"
          />

          {it.tipo === "enlace" ? (
            <Input
              value={it.url ?? ""}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://…"
              className="flex-1"
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-muted sm:flex-1">
              <FileText className="h-3.5 w-3.5" />
              La subida de archivos se habilita con Supabase
            </span>
          )}

          <button
            type="button"
            onClick={() => remove(i)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-blush-soft/60 hover:text-ink"
            aria-label="Quitar material"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-dashed border-copper/40 px-4 py-2 text-sm font-medium text-ink-soft transition-colors",
          "hover:border-blush-deep hover:text-ink",
        )}
      >
        <Plus className="h-4 w-4" /> Agregar material
      </button>

      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Link2 className="h-3.5 w-3.5" />
        Los enlaces se abren en una pestaña nueva.
      </p>
    </div>
  );
}
