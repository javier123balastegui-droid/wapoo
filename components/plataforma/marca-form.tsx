"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Loader2, Save, AlertCircle, CheckCircle2, AlertTriangle, ImageUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { guardarMarcaAction, type FichaState } from "@/app/actions/plataforma";
import {
  PALETAS,
  PATRON_HEX,
  TEXTO_CLARO,
  TEXTO_OSCURO,
  derivarPaleta,
  problemaDeContraste,
} from "@/lib/colores";

export function MarcaForm({
  slug,
  nombre,
  logoUrl,
  fondo: fondoInicial,
  acento: acentoInicial,
}: {
  slug: string;
  nombre: string;
  logoUrl: string;
  fondo: string;
  acento: string;
}) {
  const [state, action, pending] = useActionState<FichaState, FormData>(guardarMarcaAction, undefined);
  const [fondo, setFondo] = useState(fondoInicial);
  const [acento, setAcento] = useState(acentoInicial);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);

  // Vista previa del archivo elegido, sin subirlo todavía.
  useEffect(() => () => {
    if (archivo) URL.revokeObjectURL(archivo);
  }, [archivo]);

  const validos = PATRON_HEX.test(fondo) && PATRON_HEX.test(acento);
  const paleta = validos ? derivarPaleta(fondo, acento) : null;
  const problema = useMemo(() => (validos ? problemaDeContraste(fondo, acento) : null), [fondo, acento, validos]);
  const logoVisible = quitar ? "" : (archivo ?? logoUrl);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />

      {/* Vista previa: así se ve la cabecera de su web. */}
      <div
        className="overflow-hidden rounded-2xl p-5"
        style={{ background: paleta?.canvas ?? fondoInicial, color: TEXTO_CLARO }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#fbf7f4]">
            {logoVisible ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo local
              <img src={logoVisible} alt="" className="h-full w-full scale-[1.55] object-contain" />
            ) : (
              <span className="font-display text-lg font-semibold" style={{ color: TEXTO_OSCURO }}>
                {nombre.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="font-display text-lg font-semibold">{nombre}</span>
        </div>
        <p className="mt-4 font-display text-2xl font-semibold">Así se ve su web</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{ background: paleta?.blush ?? acentoInicial, color: TEXTO_OSCURO }}
          >
            Inscribite
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{ background: paleta?.["blush-soft"], color: paleta?.["canvas-deep"] }}
          >
            Nueva
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Paletas sugeridas</Label>
        <div className="flex flex-wrap gap-2">
          {PALETAS.map((p) => (
            <button
              key={p.nombre}
              type="button"
              onClick={() => {
                setFondo(p.fondo);
                setAcento(p.acento);
              }}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink hover:border-copper/60"
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.fondo }} />
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.acento }} />
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorCampo label="Fondo" ayuda="Las páginas. Lleva texto claro encima." name="fondo" valor={fondo} onCambio={setFondo} />
        <ColorCampo label="Acento" ayuda="Botones y detalles. Lleva texto oscuro." name="acento" valor={acento} onCambio={setAcento} />
      </div>

      {problema && (
        <p
          className={
            problema.grave
              ? "flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
              : "flex items-center gap-2 rounded-xl bg-pago-sena-bg px-3 py-2.5 text-sm text-pago-sena"
          }
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {problema.mensaje}
        </p>
      )}

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-copper/40 bg-surface/60 px-4 py-2 text-sm text-ink hover:bg-blush-soft/50">
            <ImageUp className="h-4 w-4" />
            {logoUrl ? "Cambiar logo" : "Subir logo"}
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                setQuitar(false);
                setArchivo(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          {logoUrl && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="quitarLogo"
                checked={quitar}
                onChange={(ev) => setQuitar(ev.target.checked)}
                className="h-4 w-4"
              />
              Quitar el logo (se muestra la inicial)
            </label>
          )}
        </div>
        <p className="text-xs text-ink-muted">PNG, JPG o WebP, hasta 2 MB. Mejor cuadrado y con fondo transparente.</p>
      </div>

      {state?.error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-2 rounded-xl bg-pago-ok-bg px-3 py-2.5 text-sm text-pago-ok">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {state.ok}
        </p>
      )}

      <Button type="submit" disabled={pending || !validos || problema?.grave}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar marca
      </Button>
    </form>
  );
}

function ColorCampo({
  label,
  ayuda,
  name,
  valor,
  onCambio,
}: {
  label: string;
  ayuda: string;
  name: string;
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={PATRON_HEX.test(valor) ? valor : "#000000"}
          onChange={(ev) => onCambio(ev.target.value)}
          className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-surface p-1"
          aria-label={`${label} (selector)`}
        />
        <Input name={name} value={valor} onChange={(ev) => onCambio(ev.target.value.trim())} maxLength={7} />
      </div>
      <p className="text-xs text-ink-muted">{ayuda}</p>
    </div>
  );
}
