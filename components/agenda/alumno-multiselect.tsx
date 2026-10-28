"use client";

import { useEffect, useRef, useState } from "react";
import { Users, ChevronDown, X, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlumnoLite {
  id: string;
  nombre: string;
  carrera: string;
}

export function AlumnoMultiselect({
  alumnos,
  value,
  onChange,
}: {
  alumnos: AlumnoLite[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const seleccionados = alumnos.filter((a) => value.includes(a.id));
  const filtrados = alumnos.filter((a) =>
    a.nombre.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 text-sm transition-colors hover:border-blush-deep",
          open && "border-blush-deep ring-2 ring-blush-deep/20",
        )}
      >
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blush-deep" />
          {value.length > 0 ? (
            <span className="text-ink">
              {value.length} {value.length === 1 ? "alumno" : "alumnos"}
            </span>
          ) : (
            <span className="text-ink-muted">Seleccioná alumnos</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-ink-muted" />
      </button>

      {seleccionados.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {seleccionados.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-blush-soft px-2.5 py-1 text-xs font-medium text-ink"
            >
              {a.nombre}
              <button
                type="button"
                onClick={() => toggle(a.id)}
                className="text-blush-deep hover:text-ink"
                aria-label={`Quitar ${a.nombre}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-line bg-surface p-2 shadow-lift">
          <div className="relative mb-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar alumno…"
              className="h-10 w-full rounded-xl border border-line bg-cream pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-blush-deep focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-ink-muted">
                Sin resultados.
              </p>
            ) : (
              filtrados.map((a) => {
                const sel = value.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-blush-soft/50"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                        sel
                          ? "border-blush-deep bg-blush-deep text-white"
                          : "border-line bg-surface",
                      )}
                    >
                      {sel && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {a.nombre}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {a.carrera}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
