"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, RotateCcw } from "lucide-react";

type Burbuja = { de: "yo" | "bot"; texto: string };

// El bot escribe en varios mensajes cortos separados por líneas en blanco.
// Los mostramos como burbujas separadas para que se vea como WhatsApp real.
function partirEnBurbujas(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function BotTestPage() {
  // Un contacto de prueba nuevo por cada carga de la página.
  const [contacto, setContacto] = useState(() => `test-${Date.now()}`);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [burbujas, cargando]);

  function reiniciar() {
    setContacto(`test-${Date.now()}`);
    setBurbujas([]);
    setError(null);
    setTexto("");
  }

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || cargando || !contacto) return;

    setError(null);
    setBurbujas((b) => [...b, { de: "yo", texto: mensaje }]);
    setTexto("");
    setCargando(true);

    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacto, mensaje }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detalle || data.error || "Error del servidor");
      }
      const nuevas = partirEnBurbujas(data.respuesta).map(
        (t): Burbuja => ({ de: "bot", texto: t }),
      );
      setBurbujas((b) => [...b, ...nuevas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-ink">
            Prueba del bot de WhatsApp
          </h1>
          <p className="text-sm text-ink/60">
            Escribí como si fueras un alumno. El bot responde con la API de
            Claude.
          </p>
        </div>
        <button
          onClick={reiniciar}
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-cream px-3 py-2 text-sm text-ink/70 transition hover:bg-cream/70"
          title="Empezar una conversación nueva"
        >
          <RotateCcw className="size-4" />
          Reiniciar
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl bg-cream/50 p-4">
        {burbujas.length === 0 && (
          <p className="mt-8 text-center text-sm text-ink/40">
            Mandá el primer mensaje, por ejemplo:
            <br />
            <span className="italic">
              &ldquo;Hola! Quiero info sobre las clases de anatomía&rdquo;
            </span>
          </p>
        )}

        {burbujas.map((b, i) => (
          <div
            key={i}
            className={`flex ${b.de === "yo" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                b.de === "yo"
                  ? "bg-[#AE6675] text-cream"
                  : "bg-white text-ink shadow-sm"
              }`}
            >
              {b.texto}
            </div>
          </div>
        ))}

        {cargando && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm text-ink/50 shadow-sm">
              <Loader2 className="size-4 animate-spin" />
              escribiendo…
            </div>
          </div>
        )}

        <div ref={finRef} />
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder="Escribí un mensaje…"
          className="max-h-32 flex-1 resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-[#AE6675]"
        />
        <button
          onClick={enviar}
          disabled={cargando || !texto.trim()}
          className="flex size-12 items-center justify-center rounded-xl bg-[#AE6675] text-cream transition hover:opacity-90 disabled:opacity-40"
          title="Enviar"
        >
          <Send className="size-5" />
        </button>
      </div>
    </main>
  );
}
