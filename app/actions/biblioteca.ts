"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  actualizarConteo,
  crearDocumento,
  eliminarDocumento,
  guardarFragmentos,
  type FragmentoNuevo,
} from "@/lib/biblioteca";

/**
 * Acciones de la biblioteca. Todas exigen ADMIN: acá se carga el material de
 * referencia con el que el bot le explica anatomía a las alumnas.
 *
 * La carga viene del navegador de a tandas (ver components/biblioteca/
 * subir-libro.tsx), porque un libro entero no entra en una sola request.
 */

export type ResultadoCarga = { ok: boolean; documentoId?: string; error?: string };

const MAX_FRAGMENTOS_POR_TANDA = 200;

export async function crearDocumentoAction(
  titulo: string,
  autor: string,
): Promise<ResultadoCarga> {
  const { organizacionId: orgId } = await requireAdmin();
  const t = titulo.trim();
  if (!t) return { ok: false, error: "Poné un título para el libro." };
  try {
    const documentoId = await crearDocumento(orgId, t, autor.trim());
    return { ok: true, documentoId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo crear el documento.",
    };
  }
}

export async function subirFragmentosAction(
  documentoId: string,
  fragmentos: FragmentoNuevo[],
): Promise<ResultadoCarga> {
  const { organizacionId: orgId } = await requireAdmin();
  if (!documentoId) return { ok: false, error: "Falta el documento." };
  if (fragmentos.length > MAX_FRAGMENTOS_POR_TANDA) {
    return {
      ok: false,
      error: `Demasiados fragmentos de una vez (máximo ${MAX_FRAGMENTOS_POR_TANDA}).`,
    };
  }
  try {
    await guardarFragmentos(orgId, documentoId, fragmentos);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudieron guardar los fragmentos.",
    };
  }
}

export async function finalizarCargaAction(
  documentoId: string,
  total: number,
): Promise<void> {
  const { organizacionId: orgId } = await requireAdmin();
  await actualizarConteo(orgId, documentoId, total);
  revalidatePath("/panel/biblioteca");
}

export async function eliminarDocumentoAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await eliminarDocumento(orgId, id);
  revalidatePath("/panel/biblioteca");
}
