"use server";

import { revalidatePath } from "next/cache";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import { guardarPlan, generarCobros, marcarCobro } from "@/lib/cobros";
import { MONEDAS_ABONO } from "@/lib/paises";

export type PlanState = { error?: string; ok?: string } | undefined;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const numero = (fd: FormData, campo: string) => Number(texto(fd, campo).replace(",", "."));

export async function guardarPlanAction(_prev: PlanState, fd: FormData): Promise<PlanState> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  const plan = {
    abonoMonto: numero(fd, "abonoMonto"),
    abonoMoneda: texto(fd, "abonoMoneda"),
    botTopeUsd: numero(fd, "botTopeUsd"),
    excedenteFactor: numero(fd, "excedenteFactor"),
    sinCargo: fd.get("sinCargo") === "on",
  };
  if (!Number.isFinite(plan.abonoMonto) || plan.abonoMonto < 0) return { error: "El abono tiene que ser un número de 0 para arriba." };
  if (!MONEDAS_ABONO.includes(plan.abonoMoneda)) return { error: "Elegí la moneda del abono." };
  if (!Number.isFinite(plan.botTopeUsd) || plan.botTopeUsd < 0) return { error: "El tope del bot va en dólares, de 0 para arriba." };
  if (!Number.isFinite(plan.excedenteFactor) || plan.excedenteFactor < 1) {
    return { error: "El factor del excedente tiene que ser 1 o más (1 = al costo)." };
  }
  try {
    await guardarPlan(slug, plan);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el plan." };
  }
  revalidatePath(`/panel/plataforma/${slug}`);
  revalidatePath("/panel/plataforma/cobros");
  return { ok: "Plan guardado. Vale para los resúmenes que se armen desde ahora." };
}

export async function generarCobrosAction(_prev: PlanState, fd: FormData): Promise<PlanState> {
  await requirePlataforma();
  const periodo = texto(fd, "periodo");
  try {
    const r = await generarCobros(periodo);
    revalidatePath("/panel/plataforma/cobros");
    revalidatePath("/panel/plataforma");
    const partes = [
      r.creados && `${r.creados} nuevo${r.creados === 1 ? "" : "s"}`,
      r.actualizados && `${r.actualizados} actualizado${r.actualizados === 1 ? "" : "s"}`,
      r.pagados && `${r.pagados} ya pagado${r.pagados === 1 ? "" : "s"} (no se tocan)`,
    ].filter(Boolean);
    return { ok: partes.length ? `Resúmenes: ${partes.join(", ")}.` : "No hay academias que paguen." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron armar los resúmenes." };
  }
}

export async function marcarCobroAction(fd: FormData): Promise<void> {
  await requirePlataforma();
  await marcarCobro(texto(fd, "id"), fd.get("pagado") === "true", texto(fd, "nota"));
  revalidatePath("/panel/plataforma/cobros");
  revalidatePath("/panel/plataforma");
  const slug = texto(fd, "slug");
  if (slug) revalidatePath(`/panel/plataforma/${slug}`);
}
