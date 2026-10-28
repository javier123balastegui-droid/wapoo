"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { aprobarPedidoUnion, rechazarPedidoUnion } from "@/lib/mock-data";

export async function aprobarPedidoAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await aprobarPedidoUnion(orgId, id);
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel");
}

export async function rechazarPedidoAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await rechazarPedidoUnion(id);
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel");
}
