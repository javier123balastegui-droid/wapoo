import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  ArrowLeft,
  Pencil,
  Link2,
  FileText,
  Lock,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTemaById } from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ContenidoRender } from "@/components/temario/contenido-render";
import { DeleteTemaButton } from "@/components/temario/delete-tema-button";
import { fechaLarga } from "@/lib/utils";

export default async function TemaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const tema = await getTemaById(id);
  if (!tema) notFound();
  const esAdmin = user.rol === "ADMIN";

  return (
    <div className="space-y-6">
      <Link
        href="/panel/temario"
        className="inline-flex items-center gap-1.5 text-sm text-cream/80 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al temario
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-cream ring-1 ring-white/25">
            <BookOpen className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="font-display text-4xl font-semibold text-cream">
              {tema.titulo}
            </h1>
            {tema.descripcion && (
              <p className="mt-1 text-cream/85">{tema.descripcion}</p>
            )}
            <p className="mt-1.5 text-xs capitalize text-cream/65">
              Actualizado {fechaLarga(tema.actualizadoEn)}
            </p>
          </div>
        </div>

        {esAdmin ? (
          <div className="flex items-center gap-1">
            <Link
              href={`/panel/temario/editar/${tema.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="h-4 w-4" /> Editar
            </Link>
            <DeleteTemaButton id={tema.id} />
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-cream">
            <Lock className="h-3.5 w-3.5" /> Solo lectura
          </span>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-7 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-ink">
            Contenido y objetivos
          </h2>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          {tema.contenido.trim() ? (
            <ContenidoRender text={tema.contenido} />
          ) : (
            <p className="text-sm text-ink-muted">Sin contenido cargado.</p>
          )}
        </Card>

        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Material
          </h2>
          <div className="rule-copper my-4 h-px w-full opacity-60" />
          {tema.recursos.length === 0 ? (
            <p className="text-sm text-ink-muted">Sin material adjunto.</p>
          ) : (
            <ul className="space-y-2">
              {tema.recursos.map((r) =>
                r.tipo === "enlace" && r.url ? (
                  <li key={r.id}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-rose/40 px-3 py-2.5 text-sm text-ink transition-colors hover:border-blush-deep/40 hover:bg-blush-soft/40"
                    >
                      <Link2 className="h-4 w-4 shrink-0 text-blush-deep" />
                      <span className="flex-1">{r.titulo}</span>
                    </a>
                  </li>
                ) : (
                  <li
                    key={r.id}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-rose/40 px-3 py-2.5 text-sm text-ink-soft"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-copper" />
                    <span className="flex-1">{r.titulo}</span>
                  </li>
                ),
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
