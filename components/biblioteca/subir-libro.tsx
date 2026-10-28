"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  crearDocumentoAction,
  finalizarCargaAction,
  subirFragmentosAction,
} from "@/app/actions/biblioteca";
import type { FragmentoNuevo } from "@/lib/biblioteca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Carga de un libro a la biblioteca del bot.
 *
 * El PDF se lee ACÁ, en el navegador, y al servidor solo viaja el texto ya
 * partido en fragmentos. Es a propósito: Vercel no acepta subidas de más de
 * 4,5 MB y un libro de anatomía pesa mucho más.
 */

/** Tamaño de cada fragmento. Suficiente para que un pasaje tenga sentido solo,
 *  y chico para que la búsqueda sea precisa. */
const MAX_CARACTERES = 1200;
/** Cuántos fragmentos van por request. */
const TANDA = 200;
/** Debajo de esto un "fragmento" es basura (números de página sueltos, etc). */
const MINIMO_UTIL = 40;

function armarFragmentos(paginas: string[]): FragmentoNuevo[] {
  const fragmentos: FragmentoNuevo[] = [];
  let acumulado = "";
  let paginaInicio = 1;
  let orden = 0;

  const volcar = () => {
    const limpio = acumulado.trim();
    if (limpio.length >= MINIMO_UTIL) {
      fragmentos.push({ orden: orden++, pagina: paginaInicio, contenido: limpio });
    }
    acumulado = "";
  };

  paginas.forEach((texto, i) => {
    const limpio = (texto || "").replace(/\s+/g, " ").trim();
    if (!limpio) return;
    if (!acumulado) paginaInicio = i + 1;

    for (const oracion of limpio.split(/(?<=[.;:])\s+/)) {
      if (acumulado.length + oracion.length > MAX_CARACTERES) {
        volcar();
        paginaInicio = i + 1;
      }
      acumulado += (acumulado ? " " : "") + oracion;
    }
  });
  volcar();
  return fragmentos;
}

export function SubirLibro() {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [trabajando, setTrabajando] = useState(false);

  async function cargar() {
    if (!archivo || !titulo.trim()) {
      setError("Elegí un PDF y ponele un título.");
      return;
    }
    setError(null);
    setTrabajando(true);
    setProgreso(0);

    try {
      setEstado("Leyendo el PDF…");
      const { getDocumentProxy, extractText } = await import("unpdf");
      const datos = new Uint8Array(await archivo.arrayBuffer());
      const pdf = await getDocumentProxy(datos);
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const paginas = Array.isArray(text) ? text : [String(text)];

      setEstado(`Procesando ${totalPages} páginas…`);
      const fragmentos = armarFragmentos(paginas);

      if (fragmentos.length === 0) {
        setError(
          "No se pudo sacar texto de este PDF. Lo más probable es que sea un " +
            "escaneo (fotos de las páginas). Para esos hace falta OCR, que es " +
            "otro proceso: avisale a Claude.",
        );
        setTrabajando(false);
        setEstado(null);
        return;
      }

      setEstado("Creando el documento…");
      const creado = await crearDocumentoAction(titulo, autor);
      if (!creado.ok || !creado.documentoId) {
        setError(creado.error ?? "No se pudo crear el documento.");
        setTrabajando(false);
        return;
      }

      for (let i = 0; i < fragmentos.length; i += TANDA) {
        const tanda = fragmentos.slice(i, i + TANDA);
        const r = await subirFragmentosAction(creado.documentoId, tanda);
        if (!r.ok) {
          setError(r.error ?? "Falló la carga a mitad de camino.");
          setTrabajando(false);
          return;
        }
        setProgreso(Math.round(((i + tanda.length) / fragmentos.length) * 100));
        setEstado(`Guardando… ${i + tanda.length} de ${fragmentos.length}`);
      }

      await finalizarCargaAction(creado.documentoId, fragmentos.length);
      setEstado(
        `Listo: ${fragmentos.length} fragmentos de ${totalPages} páginas. Ya lo puede usar el bot.`,
      );
      setArchivo(null);
      setTitulo("");
      setAutor("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado leyendo el PDF.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="titulo">Título del libro</Label>
          <Input
            id="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Latarjet — Anatomía Humana, Tomo 1"
            disabled={trabajando}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="autor">Autor (opcional)</Label>
          <Input
            id="autor"
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
            placeholder="Latarjet / Ruiz Liard"
            disabled={trabajando}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="archivo">Archivo PDF</Label>
        <input
          id="archivo"
          type="file"
          accept="application/pdf"
          disabled={trabajando}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-blush-deep file:px-4 file:py-2 file:text-sm file:text-cream"
        />
        <p className="text-xs text-ink-muted">
          El archivo se procesa en tu navegador; al servidor solo va el texto.
          Un libro grande puede tardar unos minutos: no cierres la pestaña.
        </p>
      </div>

      {trabajando && progreso > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-blush-deep transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>
      )}

      {estado && <p className="text-sm text-ink-soft">{estado}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <Button onClick={cargar} disabled={trabajando}>
        {trabajando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> Cargar a la biblioteca
          </>
        )}
      </Button>
    </div>
  );
}
