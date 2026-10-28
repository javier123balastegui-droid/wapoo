import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import { AcademiaForm } from "@/components/plataforma/academia-form";

export const metadata = { title: "Nueva academia" };

export default async function NuevaAcademiaPage() {
  await requirePlataforma();
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/panel/plataforma"
          className="inline-flex items-center gap-1.5 text-sm text-cream/85 hover:text-cream"
        >
          <ArrowLeft className="h-4 w-4" /> Plataforma
        </Link>
        <h1 className="mt-2 font-display text-4xl font-semibold text-cream">Nueva academia</h1>
        <p className="mt-2 text-cream/85">
          Con esto queda creada y con su primer administrador. El número de WhatsApp se conecta
          después, desde su ficha.
        </p>
      </header>
      <AcademiaForm />
    </div>
  );
}
