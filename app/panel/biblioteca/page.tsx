import { Library, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarDocumentos } from "@/lib/biblioteca";
import { eliminarDocumentoAction } from "@/app/actions/biblioteca";
import { SubirLibro } from "@/components/biblioteca/subir-libro";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function BibliotecaPage() {
  const { organizacionId: orgId } = await requireAdmin();
  const documentos = await listarDocumentos(orgId);
  const totalFragmentos = documentos.reduce((s, d) => s + d.fragmentos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-cream">
          Biblioteca
        </h1>
        <p className="mt-1 text-sm text-cream/85">
          El material del que el bot saca las respuestas de anatomía. Si una
          alumna pregunta algo que no está acá, el bot lo dice y deriva al
          equipo en vez de inventar.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-xl font-semibold text-ink">
          Cargar un libro
        </h2>
        <SubirLibro />
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            Material cargado
          </h2>
          {documentos.length > 0 && (
            <span className="text-sm text-ink-muted">
              {totalFragmentos.toLocaleString("es-AR")} fragmentos
            </span>
          )}
        </div>

        {documentos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Library className="h-8 w-8 text-ink-muted" />
            <p className="text-sm text-ink-muted">
              Todavía no hay nada cargado. Mientras la biblioteca esté vacía, el
              bot va a derivar todas las consultas de anatomía.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {documentos.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{d.titulo}</p>
                  <p className="text-sm text-ink-muted">
                    {d.autor ? `${d.autor} · ` : ""}
                    {d.fragmentos.toLocaleString("es-AR")} fragmentos
                  </p>
                </div>
                <form action={eliminarDocumentoAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="outline" size="sm">
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
