"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  responderComoHumanoAction,
  type ResultadoRespuesta,
} from "@/app/actions/bot-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Caja para que la directora le conteste al alumno por WhatsApp desde el panel.
 *
 * Solo aparece cuando la conversación está en modo humano. Si la ventana de 24
 * horas de WhatsApp está cerrada, se deshabilita y se explica por qué: es
 * preferible avisarlo antes que dejarla escribir un mensaje que va a rebotar.
 */
export function ResponderForm({
  conversacionId,
  ventanaAbierta,
  ultimoEntranteEn,
}: {
  conversacionId: string;
  ventanaAbierta: boolean;
  ultimoEntranteEn: string | null;
}) {
  const [resultado, formAction, enviando] = useActionState<
    ResultadoRespuesta | null,
    FormData
  >(responderComoHumanoAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  // La hora de cuando se abrió la conversación: alcanza para contar las horas.
  const [ahora] = useState(() => Date.now());

  useEffect(() => {
    if (resultado?.ok) formRef.current?.reset();
  }, [resultado]);

  const horasDesde = ultimoEntranteEn
    ? Math.floor(
        (ahora - new Date(ultimoEntranteEn).getTime()) / (1000 * 60 * 60),
      )
    : null;

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={conversacionId} />

      <Textarea
        name="texto"
        rows={3}
        maxLength={4000}
        disabled={!ventanaAbierta || enviando}
        placeholder={
          ventanaAbierta
            ? "Escribile al alumno…"
            : "No se le puede escribir ahora (ventana de 24 h cerrada)."
        }
        aria-label="Mensaje para el alumno"
      />

      {!ventanaAbierta && (
        <p className="text-sm text-ink-soft">
          {ultimoEntranteEn === null ? (
            <>
              Este contacto todavía no escribió nunca, así que WhatsApp no
              permite mandarle un mensaje libre.
            </>
          ) : (
            <>
              Pasaron {horasDesde} horas desde su último mensaje. WhatsApp solo
              deja responder texto libre dentro de las 24 h; cuando el alumno
              vuelva a escribir se habilita sola.
            </>
          )}
        </p>
      )}

      {resultado?.mensaje && (
        <p
          className={`text-sm ${resultado.ok ? "text-ink-soft" : "text-red-700"}`}
          role="status"
        >
          {resultado.mensaje}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!ventanaAbierta || enviando}>
          {enviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Enviar por WhatsApp
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
