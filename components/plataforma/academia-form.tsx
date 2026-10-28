"use client";

import { useActionState, useState } from "react";
import { Loader2, Building2, Save, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PAISES, paisDe } from "@/lib/paises";
import {
  crearAcademiaAction,
  editarAcademiaAction,
  type AcademiaFormState,
} from "@/app/actions/plataforma";

type Franja = { apertura: number; cierre: number } | null;

/** Lo que muestra el formulario al editar (los datos actuales). */
export type ValoresAcademia = {
  slug: string;
  nombre: string;
  materia: string;
  directora: string;
  descripcion: string;
  aliasPago: string;
  titularPago: string;
  instagramUrl: string;
  whatsappPublico: string;
  horarios: Franja[];
  reagendaAnticipacionMin: number;
  reagendaToleranciaMin: number;
  duracionMinima: number;
  pasoDuracion: number;
  moneda: string;
  locale: string;
  zonaHoraria: string;
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Horario de arranque sugerido para una academia nueva: lunes a viernes de
 *  14 a 22, sábados de 9 a 13. */
const SUGERIDO: Franja[] = [
  null,
  { apertura: 840, cierre: 1320 },
  { apertura: 840, cierre: 1320 },
  { apertura: 840, cierre: 1320 },
  { apertura: 840, cierre: 1320 },
  { apertura: 840, cierre: 1320 },
  { apertura: 540, cierre: 780 },
];
/** Lunes primero, como se lee una semana. */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function slugDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Alta ──

export function AcademiaForm() {
  const [state, action, pending] = useActionState<AcademiaFormState, FormData>(
    crearAcademiaAction,
    undefined,
  );
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const e = state?.errors ?? {};

  return (
    <form action={action} className="space-y-6">
      <CamposAcademia
        errors={e}
        onNombre={(nombre) => {
          if (!slugTocado) setSlug(slugDe(nombre));
        }}
        extraIdentidad={
          <Campo label="Identificador" error={e.slug} ayuda="No se puede cambiar después.">
            <Input
              name="slug"
              placeholder="matematica-facil"
              value={slug}
              onChange={(ev) => {
                setSlugTocado(true);
                setSlug(ev.target.value);
              }}
              required
            />
          </Campo>
        }
      />

      <Card className="space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Dirección y primer administrador</h2>
        <Campo
          label="Dominio"
          error={e.dominio}
          ayuda="Por donde entran los alumnos y el equipo. Después hay que agregarlo en Vercel y apuntar el DNS."
        >
          <Input name="dominio" placeholder="matematicafacil.com.ar" required />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Nombre" error={e.adminNombre}>
            <Input name="adminNombre" placeholder="Nombre y apellido" required />
          </Campo>
          <Campo label="Email" error={e.adminEmail}>
            <Input name="adminEmail" type="email" placeholder="cuenta@email.com" required />
          </Campo>
          <Campo label="Contraseña inicial" error={e.adminPassword}>
            <Input name="adminPassword" type="password" placeholder="Mínimo 8 caracteres" required />
          </Campo>
        </div>
      </Card>

      <MensajeError mensaje={state?.error} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creando…
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4" /> Crear academia
            </>
          )}
        </Button>
        <p className="text-sm text-cream/85">
          El bot arranca apagado y los precios en cero: no atiende a nadie hasta que la academia los configure.
        </p>
      </div>
    </form>
  );
}

// ── Edición ──

export function EditarAcademiaForm({ valores }: { valores: ValoresAcademia }) {
  const [state, action, pending] = useActionState<AcademiaFormState, FormData>(
    editarAcademiaAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={valores.slug} />
      <CamposAcademia errors={state?.errors ?? {}} valores={valores} />
      <MensajeError mensaje={state?.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
        <p className="text-sm text-cream/85">
          Pueden tardar hasta 5 minutos en verse en el bot y en la web.
        </p>
      </div>
    </form>
  );
}

// ── Los campos de la academia (iguales en el alta y en la edición) ──

function CamposAcademia({
  errors: e,
  valores,
  onNombre,
  extraIdentidad,
}: {
  errors: Record<string, string>;
  valores?: ValoresAcademia;
  onNombre?: (nombre: string) => void;
  extraIdentidad?: React.ReactNode;
}) {
  const horarios = valores?.horarios ?? SUGERIDO;
  const paisConocido = valores ? paisDe(valores.moneda, valores.zonaHoraria) : PAISES[0];
  const paisInicial = paisConocido?.id ?? "actual";
  const horasReagenda = (valores?.reagendaAnticipacionMin ?? 180) / 60;

  return (
    <>
      <Card className="space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">La academia</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre" error={e.nombre}>
            <Input
              name="nombre"
              placeholder="Matemática Fácil"
              defaultValue={valores?.nombre}
              onChange={(ev) => onNombre?.(ev.target.value)}
              required
            />
          </Campo>
          {extraIdentidad}
          <Campo label="Materia" error={e.materia} ayuda="La usa el bot: “clases de …”.">
            <Input name="materia" placeholder="Matemática" defaultValue={valores?.materia} required />
          </Campo>
          <Campo label="Directora o director">
            <Input name="directora" placeholder="Nombre y apellido" defaultValue={valores?.directora} />
          </Campo>
          <Campo label="País" error={e.pais} ayuda="Define la moneda de los precios y la zona horaria de la agenda.">
            <Select name="pais" defaultValue={paisInicial}>
              {!paisConocido && valores && (
                <option value="actual">
                  Como está ({valores.moneda}, {valores.zonaHoraria})
                </option>
              )}
              {PAISES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.moneda}
                </option>
              ))}
            </Select>
            {valores && (
              <>
                <input type="hidden" name="monedaActual" value={valores.moneda} />
                <input type="hidden" name="localeActual" value={valores.locale} />
                <input type="hidden" name="zonaActual" value={valores.zonaHoraria} />
              </>
            )}
          </Campo>
        </div>
        <Campo label="Descripción" ayuda="Una o dos oraciones. Va en el bot y en la web.">
          <Textarea
            name="descripcion"
            rows={2}
            placeholder="Clases particulares de matemática para secundario y CBC."
            defaultValue={valores?.descripcion}
          />
        </Campo>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Cobros y contacto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Alias para transferencias" ayuda="El bot lo pasa para la seña.">
            <Input name="aliasPago" placeholder="academia.mp" defaultValue={valores?.aliasPago} />
          </Campo>
          <Campo label="Titular de la cuenta" ayuda="El bot lo usa para revisar comprobantes.">
            <Input name="titularPago" placeholder="Nombre y apellido" defaultValue={valores?.titularPago} />
          </Campo>
          <Campo label="Instagram (opcional)">
            <Input name="instagramUrl" placeholder="https://www.instagram.com/..." defaultValue={valores?.instagramUrl} />
          </Campo>
          <Campo label="WhatsApp público (opcional)" ayuda="Para la página de privacidad.">
            <Input name="whatsappPublico" placeholder="5491122334455" defaultValue={valores?.whatsappPublico} />
          </Campo>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Horarios y reagenda</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Los días y horas en que se dan clases. El bot y el portal solo ofrecen estos.
          </p>
        </div>
        <div className="space-y-2">
          {ORDEN.map((dow) => (
            <div key={dow} className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name={`dia-${dow}-abierto`}
                  defaultChecked={horarios[dow] !== null}
                  className="h-4 w-4 accent-[var(--color-blush-deep)]"
                />
                {DIAS[dow]}
              </label>
              <Input
                name={`dia-${dow}-desde`}
                type="time"
                defaultValue={hhmm(horarios[dow]?.apertura ?? 540)}
                className="w-32"
                aria-label={`${DIAS[dow]} desde`}
              />
              <span className="text-sm text-ink-muted">a</span>
              <Input
                name={`dia-${dow}-hasta`}
                type="time"
                defaultValue={hhmm(horarios[dow]?.cierre ?? 780)}
                className="w-32"
                aria-label={`${DIAS[dow]} hasta`}
              />
            </div>
          ))}
        </div>
        {e.horarios && <p className="text-sm text-[#a85d5d]">{e.horarios}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-ink">
          Para reagendar sin perder la seña, el alumno avisa con
          <Input
            name="reagendaHoras"
            type="number"
            min={0}
            max={168}
            step={0.5}
            defaultValue={horasReagenda}
            className="w-20"
            aria-label="Horas de anticipación"
          />
          horas de anticipación, con
          <Input
            name="reagendaTolerancia"
            type="number"
            min={0}
            step={5}
            defaultValue={valores?.reagendaToleranciaMin ?? 15}
            className="w-20"
            aria-label="Minutos de tolerancia"
          />
          minutos de tolerancia.
        </div>
        {e.reagenda && <p className="text-sm text-[#a85d5d]">{e.reagenda}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-ink">
          Las clases duran desde
          <Input
            name="duracionMinima"
            type="number"
            min={15}
            max={600}
            step={5}
            defaultValue={valores?.duracionMinima ?? 60}
            className="w-20"
            aria-label="Duración mínima en minutos"
          />
          minutos, y se alargan de
          <Input
            name="pasoDuracion"
            type="number"
            min={5}
            max={240}
            step={5}
            defaultValue={valores?.pasoDuracion ?? 30}
            className="w-20"
            aria-label="Paso de la duración en minutos"
          />
          en esa cantidad de minutos.
        </div>
        {e.duracion && <p className="text-sm text-[#a85d5d]">{e.duracion}</p>}
      </Card>
    </>
  );
}

function MensajeError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-xl bg-[#fbeaea] px-3 py-2.5 text-sm text-[#a85d5d]"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      {mensaje}
    </p>
  );
}

function Campo({
  label,
  error,
  ayuda,
  children,
}: {
  label: string;
  error?: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-[#a85d5d]">{error}</p>
      ) : (
        ayuda && <p className="text-xs text-ink-muted">{ayuda}</p>
      )}
    </div>
  );
}
