"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { crearTema, actualizarTema, eliminarTema } from "@/lib/mock-data";
import type { Recurso } from "@/lib/types";

export type TemaFormState =
  | { error?: string; errors?: { titulo?: string } }
  | undefined;

// Helper local (NO exportado: en archivos "use server" solo se exportan
// funciones async).
function parseRecursos(raw: FormDataEntryValue | null): Recurso[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (r): r is { titulo: string; tipo?: string; url?: string; id?: string } =>
          !!r && typeof r === "object" && typeof (r as { titulo?: unknown }).titulo === "string" &&
          (r as { titulo: string }).titulo.trim() !== "",
      )
      .map((r, i) => ({
        id: typeof r.id === "string" ? r.id : `r-${Date.now()}-${i}`,
        titulo: r.titulo.trim(),
        tipo: r.tipo === "archivo" ? ("archivo" as const) : ("enlace" as const),
        url: typeof r.url === "string" && r.url.trim() ? r.url.trim() : undefined,
      }));
  } catch {
    return [];
  }
}

export async function crearTemaAction(
  _prev: TemaFormState,
  formData: FormData,
): Promise<TemaFormState> {
  await requireAdmin();
  const titulo = String(formData.get("titulo") ?? "").trim();

  const tema = await crearTema({
    titulo,
    descripcion: String(formData.get("descripcion") ?? "").trim(),
    contenido: String(formData.get("contenido") ?? ""),
    recursos: parseRecursos(formData.get("recursos")),
  });

  revalidatePath("/panel/temario");
  redirect(`/panel/temario/${tema.id}`);
}

export async function actualizarTemaAction(
  _prev: TemaFormState,
  formData: FormData,
): Promise<TemaFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();

  const tema = await actualizarTema(id, {
    titulo,
    descripcion: String(formData.get("descripcion") ?? "").trim(),
    contenido: String(formData.get("contenido") ?? ""),
    recursos: parseRecursos(formData.get("recursos")),
  });
  if (!tema) return { error: "No se encontró el tema a editar." };

  revalidatePath("/panel/temario");
  revalidatePath(`/panel/temario/${id}`);
  redirect(`/panel/temario/${id}`);
}

export async function eliminarTemaAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await eliminarTema(id);
  revalidatePath("/panel/temario");
  redirect("/panel/temario");
}
