"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setTarifa, actualizarPrecios } from "@/lib/mock-data";

function montoNoNegativo(formData: FormData, key: string): number {
  const n = Number(formData.get(key));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function actualizarPreciosAction(formData: FormData) {
  await requireAdmin();
  await actualizarPrecios({
    valorIndividual: montoNoNegativo(formData, "valorIndividual"),
    valorGrupal2: montoNoNegativo(formData, "valorGrupal2"),
    valorGrupal3: montoNoNegativo(formData, "valorGrupal3"),
    valorSena: montoNoNegativo(formData, "valorSena"),
  });
  revalidatePath("/panel/finanzas");
}

export async function actualizarTarifaAction(formData: FormData) {
  await requireAdmin();
  const profeId = String(formData.get("profeId") ?? "");
  const limpio = (v: FormDataEntryValue | null) => {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  };
  await setTarifa(
    profeId,
    limpio(formData.get("valorGrupal")),
    limpio(formData.get("valorIndividual")),
    limpio(formData.get("valorCanceladaIndividual")),
    limpio(formData.get("valorCanceladaGrupal")),
  );
  revalidatePath("/panel/finanzas");
}
