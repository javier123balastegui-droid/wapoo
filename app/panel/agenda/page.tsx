import Link from "next/link";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  List,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getClases,
  getClasesEntre,
  getTemas,
  getUsuarios,
  getAlumnos,
  getPagos,
  getProfes,
} from "@/lib/mock-data";
import { ESTADO_PAGO_META } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ClaseCard,
  carrerasDeEvento,
  type EventoAgenda,
} from "@/components/agenda/clase-card";
import {
  hoyEn,
  sumarDias,
  diasDeSemana,
  lunesDeLaSemana,
  nombreDiaCorto,
  diaNumero,
  fechaLargaES,
  rangoSemanaLabel,
  sumarMes,
  nombreMesAnio,
  estaEnVivo,
} from "@/lib/fechas";
import { EstadoRealizacionIcono } from "@/components/agenda/estado-realizacion";
import { cn, minutosAHora } from "@/lib/utils";
import type { EstadoPago } from "@/lib/types";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

type Vista = "semana" | "mes" | "dia" | "lista";

function buildUrl(p: {
  vista: Vista;
  fecha?: string;
  profe?: string;
  pago?: string;
}): string {
  const sp = new URLSearchParams();
  if (p.vista !== "mes") sp.set("vista", p.vista);
  if (p.fecha) sp.set("fecha", p.fecha);
  if (p.profe) sp.set("profe", p.profe);
  if (p.pago) sp.set("pago", p.pago);
  const s = sp.toString();
  return `/panel/agenda${s ? `?${s}` : ""}`;
}

/**
 * Los eventos de la agenda, en 5 consultas.
 *
 * Antes pedía, POR CADA CLASE, el tema, el profe y —por cada alumno— su ficha
 * y su pago. Con 263 clases y 360 inscripciones eso daba más de mil consultas
 * en una sola pantalla, cada una pagando el viaje de ida y vuelta a la base
 * (95 ms medidos desde el servidor). Era la causa principal de la lentitud.
 *
 * Ahora se trae cada tabla completa de una vez y se cruza en memoria. Son
 * tablas chicas (32 alumnos, 18 temas, 3 profes), así que traerlas enteras
 * sale muchísimo más barato que pedirlas de a una.
 */
async function construirEventos(
  esAdmin: boolean,
  rango?: { desde: string; hasta: string },
): Promise<EventoAgenda[]> {
  // Todo en paralelo: lo que tarda es el viaje a la base, así que cinco
  // consultas juntas cuestan casi lo mismo que una. Los pagos se traen enteros
  // aunque se mire un rango —son pocos y no salen de acá— porque encadenarlos
  // a las clases agregaría un viaje de ida y vuelta para no ahorrar nada.
  const [clases, temas, usuarios, alumnos, pagos] = await Promise.all([
    rango ? getClasesEntre(rango.desde, rango.hasta) : getClases(),
    getTemas(),
    getUsuarios(),
    getAlumnos(),
    // Los pagos solo los ve el admin, así que al profe no se le traen.
    esAdmin ? getPagos() : Promise.resolve([]),
  ]);

  const temaPorId = new Map(temas.map((t) => [t.id, t]));
  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
  const alumnoPorId = new Map(alumnos.map((a) => [a.id, a]));
  // Un pago es de una clase y un alumno: se indexa por las dos cosas juntas.
  const pagoPorClaseYAlumno = new Map(
    pagos.map((p) => [`${p.claseId}|${p.alumnoId}`, p]),
  );

  return clases.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    inicioMin: c.inicioMin,
    duracion: c.duracion,
    tipo: c.tipo,
    estadoRealizacion: c.estadoRealizacion,
    temaTitulo: (c.temaId ? temaPorId.get(c.temaId) : undefined)?.titulo ?? "Tema",
    profeId: c.profeId,
    profeNombre:
      (c.profeId ? usuarioPorId.get(c.profeId) : undefined)?.nombre ?? "—",
    alumnos: c.alumnoIds.map((aid) => {
      const a = alumnoPorId.get(aid);
      return {
        id: aid,
        nombre: a?.nombre ?? "—",
        carrera: a?.carrera ?? "",
        estadoPago: pagoPorClaseYAlumno.get(`${c.id}|${aid}`)?.estado,
      };
    }),
  }));
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const esAdmin = user.rol === "ADMIN";
  const sp = await searchParams;

  const vistaPedida: Vista =
    sp.vista === "dia"
      ? "dia"
      : sp.vista === "lista"
        ? "lista"
        : sp.vista === "semana"
          ? "semana"
          : "mes";
  // La vista "Lista" es exclusiva de administración; un profe va al mes.
  const vista: Vista =
    vistaPedida === "lista" && !esAdmin ? "mes" : vistaPedida;
  const zona = await zonaDelPanel();
  const fecha = typeof sp.fecha === "string" ? sp.fecha : hoyEn(zona);
  const filtroProfe = typeof sp.profe === "string" ? sp.profe : "";
  const filtroPago = typeof sp.pago === "string" ? sp.pago : "";

  // Cada vista mira un rango distinto, y hasta ahora el servidor armaba las
  // 263 clases y se las mandaba enteras al navegador aunque en pantalla se
  // vieran nueve. Ahora se pide solo el rango visible. La vista Lista es la
  // excepcion: ahi se ven todas, asi que se traen todas.
  const rangoVisible =
    vista === "lista"
      ? undefined
      : vista === "dia"
        ? { desde: fecha, hasta: fecha }
        : vista === "semana"
          ? (() => {
              const d = diasDeSemana(fecha);
              return { desde: d[0], hasta: d[d.length - 1] };
            })()
          : (() => {
              // El mes se dibuja en una grilla de 42 dias que arranca el lunes
              // de la semana del dia 1: el mismo calculo que usa VistaMes.
              const inicio = lunesDeLaSemana(`${fecha.slice(0, 7)}-01`);
              return { desde: inicio, hasta: sumarDias(inicio, 41) };
            })();

  let eventos = await construirEventos(esAdmin, rangoVisible);
  // El profe solo ve sus propias clases
  if (!esAdmin) eventos = eventos.filter((e) => e.profeId === user.id);

  const profes = await getProfes();

  const mesDe = fecha.slice(0, 7);
  const fechaPrev =
    vista === "mes"
      ? `${sumarMes(mesDe, -1)}-01`
      : sumarDias(fecha, vista === "dia" ? -1 : -7);
  const fechaNext =
    vista === "mes"
      ? `${sumarMes(mesDe, 1)}-01`
      : sumarDias(fecha, vista === "dia" ? 1 : 7);
  const navLabel =
    vista === "semana"
      ? rangoSemanaLabel(fecha)
      : vista === "mes"
        ? nombreMesAnio(mesDe)
        : `${nombreDiaCorto(fecha)} ${diaNumero(fecha)}`;

  const tabs: { v: Vista; label: string; icon: typeof CalendarDays }[] = [
    { v: "mes", label: "Mes", icon: LayoutGrid },
    { v: "semana", label: "Semana", icon: CalendarRange },
    { v: "dia", label: "Día", icon: CalendarDays },
    // La vista Lista solo la ven los administradores.
    ...(esAdmin
      ? [{ v: "lista" as Vista, label: "Lista", icon: List }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-cream">
            Agenda
          </h1>
          <p className="mt-2 text-cream/85">
            {esAdmin
              ? "El calendario de clases. Creá clases y mirá quién tiene qué."
              : "Tus clases asignadas."}
          </p>
        </div>
        {esAdmin && (
          <Link
            href="/panel/agenda/nueva"
            className={buttonVariants({ variant: "solid" })}
          >
            <CalendarPlus className="h-4 w-4" /> Nueva clase
          </Link>
        )}
      </header>

      {/* Barra de control: vistas + navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-white/25 bg-white/10 p-1">
          {tabs.map((t) => {
            const activo = vista === t.v;
            const Icon = t.icon;
            return (
              <Link
                key={t.v}
                // Cada una de estas es una agenda entera: precargarlas las
                // cuatro cuesta mas que el clic que ahorran.
                prefetch={false}
                href={buildUrl({
                  vista: t.v,
                  fecha,
                  profe: filtroProfe,
                  pago: filtroPago,
                })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  activo
                    ? "bg-cream text-ink shadow-soft"
                    : "text-cream/85 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>

        {vista !== "lista" && (
          <div className="flex items-center gap-2">
            <Link
              prefetch={false}
              href={buildUrl({ vista, fecha: fechaPrev, profe: filtroProfe })}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-cream transition-colors hover:bg-white/20"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-40 text-center text-sm font-medium capitalize text-cream">
              {navLabel}
            </span>
            <Link
              prefetch={false}
              href={buildUrl({ vista, fecha: fechaNext, profe: filtroProfe })}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-cream transition-colors hover:bg-white/20"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              prefetch={false}
              href={buildUrl({ vista, fecha: hoyEn(zona), profe: filtroProfe })}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-white/20"
            >
              Hoy
            </Link>
          </div>
        )}
      </div>

      {/* Vistas */}
      {vista === "semana" && (
        <VistaSemana fecha={fecha} eventos={eventos} esAdmin={esAdmin} zona={zona} />
      )}
      {vista === "mes" && (
        <VistaMes fecha={fecha} eventos={eventos} esAdmin={esAdmin} zona={zona} />
      )}
      {vista === "dia" && (
        <VistaDia fecha={fecha} eventos={eventos} esAdmin={esAdmin} zona={zona} />
      )}
      {vista === "lista" && (
        <VistaLista
          eventos={eventos}
          esAdmin={esAdmin}
          profes={profes}
          filtroProfe={filtroProfe}
          filtroPago={filtroPago}
          zona={zona}
        />
      )}
    </div>
  );
}

function VistaSemana({
  fecha,
  eventos,
  esAdmin,
  zona,
}: {
  fecha: string;
  eventos: EventoAgenda[];
  esAdmin: boolean;
  /** Zona horaria de la academia. */
  zona: string;
}) {
  const dias = diasDeSemana(fecha);
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-3 xl:grid-cols-6">
      {dias.map((d) => {
        const delDia = eventos
          .filter((e) => e.fecha === d)
          .sort((a, b) => a.inicioMin - b.inicioMin);
        const esHoy = d === hoyEn(zona);
        return (
          <div key={d}>
            <div className="mb-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-cream/70">
                {nombreDiaCorto(d)}
              </p>
              <p
                className={cn(
                  "font-display text-lg font-semibold",
                  esHoy ? "text-[#f3d9a6]" : "text-cream",
                )}
              >
                {diaNumero(d)}
              </p>
            </div>
            <div className="space-y-2">
              {delDia.length === 0 ? (
                <p className="py-2 text-center text-xs text-cream/45">—</p>
              ) : (
                delDia.map((e) => (
                  <ClaseCard key={e.id} evento={e} esAdmin={esAdmin} zona={zona} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaMes({
  fecha,
  eventos,
  esAdmin,
  zona,
}: {
  fecha: string;
  eventos: EventoAgenda[];
  esAdmin: boolean;
  /** Zona horaria de la academia. */
  zona: string;
}) {
  void esAdmin;
  const mes = fecha.slice(0, 7);
  const inicio = lunesDeLaSemana(`${mes}-01`);
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const cols = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/5">
      <div className="grid grid-cols-7 border-b border-white/15">
        {cols.map((n) => (
          <div
            key={n}
            className="py-2 text-center text-[11px] uppercase tracking-wide text-cream/70"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const enMes = d.slice(0, 7) === mes;
          const delDia = eventos
            .filter((e) => e.fecha === d)
            .sort((a, b) => a.inicioMin - b.inicioMin);
          const esHoy = d === hoyEn(zona);
          return (
            <div
              key={d}
              className={cn(
                "min-h-24 border-b border-r border-white/10 p-1.5",
                !enMes && "opacity-40",
              )}
            >
              <div className="flex justify-end">
                <Link
                  prefetch={false}
                  href={buildUrl({ vista: "dia", fecha: d })}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full text-xs transition-colors",
                    esHoy
                      ? "bg-[#f3d9a6] font-semibold text-ink"
                      : "text-cream/80 hover:bg-white/15",
                  )}
                >
                  {diaNumero(d)}
                </Link>
              </div>
              <div className="mt-1 space-y-1">
                {delDia.map((e) => (
                  <Link
                    key={e.id}
                    prefetch={false}
                    href={`/panel/agenda/${e.id}`}
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] shadow-soft transition-colors",
                      estaEnVivo(e.fecha, e.inicioMin, e.duracion, zona)
                        ? "bg-[#15a34a] font-semibold text-white"
                        : "bg-surface text-ink hover:bg-blush-soft",
                    )}
                  >
                    <EstadoRealizacionIcono
                      estado={e.estadoRealizacion}
                      className="h-3 w-3"
                    />
                    <span className="truncate">
                      {minutosAHora(e.inicioMin)} ·{" "}
                      {carrerasDeEvento(e) || e.temaTitulo}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VistaDia({
  fecha,
  eventos,
  esAdmin,
  zona,
}: {
  fecha: string;
  eventos: EventoAgenda[];
  esAdmin: boolean;
  /** Zona horaria de la academia. */
  zona: string;
}) {
  const delDia = eventos
    .filter((e) => e.fecha === fecha)
    .sort((a, b) => a.inicioMin - b.inicioMin);
  return (
    <div className="max-w-2xl">
      <p className="mb-3 font-display text-xl font-semibold capitalize text-cream">
        {fechaLargaES(fecha)}
      </p>
      {delDia.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 p-8 text-center text-cream/80">
          No hay clases este día.
        </div>
      ) : (
        <div className="space-y-3">
          {delDia.map((e) => (
            <ClaseCard key={e.id} evento={e} esAdmin={esAdmin} zona={zona} />
          ))}
        </div>
      )}
    </div>
  );
}

function VistaLista({
  eventos,
  esAdmin,
  profes,
  filtroProfe,
  filtroPago,
  zona,
}: {
  /** Zona horaria de la academia. */
  zona: string;
  eventos: EventoAgenda[];
  esAdmin: boolean;
  profes: { id: string; nombre: string }[];
  filtroProfe: string;
  filtroPago: string;
}) {
  let lista = eventos;
  if (filtroProfe) lista = lista.filter((e) => e.profeId === filtroProfe);
  if (esAdmin && filtroPago) {
    lista = lista.filter((e) =>
      e.alumnos.some((a) => a.estadoPago === filtroPago),
    );
  }
  lista = [...lista].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.inicioMin - b.inicioMin,
  );

  const porFecha = new Map<string, EventoAgenda[]>();
  for (const e of lista) {
    const arr = porFecha.get(e.fecha) ?? [];
    arr.push(e);
    porFecha.set(e.fecha, arr);
  }

  return (
    <div className="space-y-5">
      {esAdmin && (
        <form
          method="get"
          action="/panel/agenda"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="vista" value="lista" />
          <Select name="profe" defaultValue={filtroProfe} className="w-auto">
            <option value="">Todos los profesores</option>
            {profes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <Select name="pago" defaultValue={filtroPago} className="w-auto">
            <option value="">Todos los pagos</option>
            {(Object.keys(ESTADO_PAGO_META) as EstadoPago[]).map((k) => (
              <option key={k} value={k}>
                {ESTADO_PAGO_META[k].label}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Filtrar
          </button>
          {(filtroProfe || filtroPago) && (
            <Link
              prefetch={false}
              href="/panel/agenda?vista=lista"
              className="text-sm font-medium text-cream/85 hover:text-white"
            >
              Limpiar
            </Link>
          )}
        </form>
      )}

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 p-8 text-center text-cream/80">
          No hay clases que coincidan.
        </div>
      ) : (
        [...porFecha.entries()].map(([f, evs]) => (
          <div key={f}>
            <p className="mb-2 text-sm font-medium capitalize text-cream/80">
              {fechaLargaES(f)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evs.map((e) => (
                <ClaseCard key={e.id} evento={e} esAdmin={esAdmin} zona={zona} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
