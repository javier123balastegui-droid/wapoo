import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getTemaById } from "@/lib/mock-data";
import { TemaForm } from "@/components/temario/tema-form";
import { Card } from "@/components/ui/card";
import { actualizarTemaAction } from "@/app/actions/temario";

export default async function EditarTemaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const tema = await getTemaById(id);
  if (!tema) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/panel/temario/${tema.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al tema
      </Link>
      <h1 className="font-display text-4xl font-semibold text-cream">
        Editar tema
      </h1>
      <Card className="p-6 sm:p-8">
        <TemaForm action={actualizarTemaAction} tema={tema} />
      </Card>
    </div>
  );
}
