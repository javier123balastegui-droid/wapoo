import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { TemaForm } from "@/components/temario/tema-form";
import { Card } from "@/components/ui/card";
import { crearTemaAction } from "@/app/actions/temario";

export default async function NuevoTemaPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/panel/temario"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al temario
      </Link>
      <div>
        <h1 className="font-display text-4xl font-semibold text-cream">
          Nuevo tema
        </h1>
        <p className="mt-2 text-cream/85">
          Cargá el tema y el material que se entrega al profesor.
        </p>
      </div>
      <Card className="p-6 sm:p-8">
        <TemaForm action={crearTemaAction} />
      </Card>
    </div>
  );
}
