"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { calcularSlots, type Intervalo } from "@/lib/horarios";
import { minutosAHora, cn } from "@/lib/utils";
import type { ReglasAgenda } from "@/lib/agenda-reglas";

function duracionLabel(d: number) {
  return d === 60 ? "1 hora" : d === 90 ? "1 hora y media" : "2 horas";
}

const GRUPOS = [
  { label: "Mañana", test: (m: number) => m < 12 * 60 },
  { label: "Tarde", test: (m: number) => m >= 12 * 60 && m < 18 * 60 },
  { label: "Noche", test: (m: number) => m >= 18 * 60 },
];

export function AbanicoHorario({
  value,
  onChange,
  duracion,
  ocupados,
  reglas,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  duracion: number;
  ocupados: Intervalo[];
  reglas: ReglasAgenda;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slots = calcularSlots(duracion, ocupados, reglas);
  const disponibles = slots.filter((s) => !s.disabled && !s.ocupado).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-surface px-4 text-sm transition-colors",
          disabled
            ? "cursor-not-allowed border-line opacity-60"
            : "border-line hover:border-blush-deep",
          open && "border-blush-deep ring-2 ring-blush-deep/20",
        )}
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blush-deep" />
          {value !== null ? (
            <span className="font-medium text-ink">
              {minutosAHora(value)} – {minutosAHora(value + duracion)}
            </span>
          ) : (
            <span className="text-ink-muted">
              {disabled
                ? "Primero seleccioná profesor y fecha"
                : "Seleccioná un horario"}
            </span>
          )}
        </span>
        {!disabled && (
          <span className="shrink-0 text-xs text-ink-muted">
            {disponibles} libres
          </span>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-line bg-surface p-4 shadow-lift">
          <p className="mb-3 text-xs text-ink-muted">
            Horarios para una clase de{" "}
            <span className="font-medium text-ink">{duracionLabel(duracion)}</span>.
            Los que se superponen con otra clase salen en rojo, pero podés
            elegirlos igual.
          </p>

          <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
            {GRUPOS.map((g) => {
              const items = slots.filter((s) => g.test(s.inicioMin));
              if (items.length === 0) return null;
              return (
                <div key={g.label}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-copper">
                    {g.label}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {items.map((s) => (
                      <button
                        key={s.inicioMin}
                        type="button"
                        disabled={s.disabled}
                        onClick={() => {
                          onChange(s.inicioMin);
                          setOpen(false);
                        }}
                        title={
                          s.disabled
                            ? "No entra antes del cierre (21:00)"
                            : s.ocupado
                              ? "El profe ya tiene otra clase a esa hora (se superpone). Podés elegirlo igual."
                              : s.ajustado
                                ? "Disponible, pero pegado a otra clase (sin pausa)"
                                : "Disponible"
                        }
                        className={cn(
                          "relative rounded-lg px-2 py-2 text-sm transition-all",
                          s.disabled
                            ? "cursor-not-allowed text-ink-muted/40 line-through"
                            : value === s.inicioMin
                              ? "bg-blush text-ink ring-1 ring-blush-deep"
                              : s.ocupado
                                ? "bg-[#fbeaea] text-[#a85d5d] hover:ring-1 hover:ring-[#a85d5d]/40"
                                : "bg-surface-rose/50 text-ink hover:bg-blush-soft hover:ring-1 hover:ring-blush-deep/40",
                        )}
                      >
                        {minutosAHora(s.inicioMin)}
                        {s.ocupado && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a85d5d]" />
                        )}
                        {s.ajustado && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-pago-sena" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-surface-rose ring-1 ring-blush-deep/40" />
              Libre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-[#fbeaea] ring-1 ring-[#a85d5d]/40" />
              Se superpone (podés elegirlo)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-pago-sena" />
              Sin pausa
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-ink-muted/60 line-through">00:00</span>
              No entra
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
