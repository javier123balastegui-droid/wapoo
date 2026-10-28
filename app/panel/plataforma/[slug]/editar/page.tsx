import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { getDatosAcademia } from "@/lib/plataforma";
import { requirePlataforma } from "@/lib/plataforma-acceso";
import { tieneTextoPropio } from "@/lib/bot/plantilla-prompt";
import { EditarAcademiaForm } from "@/components/plataforma/academia-form";

export const metadata = { title: "Editar academia" };

export default async function EditarAcademiaPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePlataforma();
  const { slug } = await params;
  const valores = await getDatosAcademia(slug);
  if (!valores) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/panel/plataforma/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-cream/85 hover:text-cream"
        >
          <ArrowLeft className="h-4 w-4" /> {valores.nombre}
        </Link>
        <h1 className="mt-2 font-display text-4xl font-semibold text-cream">Editar datos</h1>
      </header>

      {tieneTextoPropio(slug) && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-pago-sena-bg px-4 py-3 text-sm text-pago-sena">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Esta academia tiene instrucciones del bot escritas a mano (lib/bot/system-prompt.ts). Lo que
            cambies acá se ve en la web, pero el bot sigue diciendo lo de su texto: nombre, materia, alias y
            titular no le cambian. Los horarios y la regla de reagenda sí los usa para ofrecer y validar
            horarios, pero su texto también los menciona: si los cambiás acá, hay que cambiar el texto
            también, o el bot va a decir una cosa y ofrecer otra.
          </span>
        </p>
      )}

      <EditarAcademiaForm valores={valores} />
    </div>
  );
}
