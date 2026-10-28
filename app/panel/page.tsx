import Link from "next/link";
import {
  CalendarDays,
  GraduationCap,
  Inbox,
  BookOpen,
  ArrowRight,
  Clock,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getProximasClases,
  getAlumnos,
  getSolicitudesNuevas,
  getTemas,
  getUsuarios,
  getClasesDeProfe,
  getTotalPendienteCobro,
} from "@/lib/mock-data";
import { TIPO_CLASE_META } from "@/lib/constants";
import { cn, fechaLarga, fechaCorta, minutosAHora, formatMoneda } from "@/lib/utils";
import { estaEnVivo, hoyEn } from "@/lib/fechas";
import {
  EnVivoBadge,
  EstadoRealizacionIcono,
} from "@/components/agenda/estado-realizacion";
import { ActivarNotificaciones } from "@/components/panel/activar-notificaciones";
import type { Clase } from "@/lib/types";
import { monedaDelPanel } from "@/lib/organizacion-peticion";
import type { Moneda } from "@/lib/utils";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

type Stat = {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  destacar?: boolean;
  /** Se muestra como importe en pesos y no como una cantidad. */
  esPlata?: boolean;
};

export default async function PanelInicio() {
  const user = await requireUser();
  const m = await monedaDelPanel();
  const zona = await zonaDelPanel();
  const esAdmin = user.rol === "ADMIN";
  const primerNombre = user.nombre.split(" ")[0] || "👋";

  let stats: Stat[];
  let proximas: Clase[];

  if (esAdmin) {
    const [todas, prox5, alumnos, solicitudes, pendienteCobro] =
      await Promise.all([
        getProximasClases(),
        getProximasClases(5),
        getAlumnos(),
        getSolicitudesNuevas(),
        getTotalPendienteCobro(),
      ]);
    proximas = prox5;
    stats = [
      { icon: CalendarDays, label: "Próximas clases", value: todas.length, href: "/panel/agenda" },
      { icon: GraduationCap, label: "Alumnos", value: alumnos.length, href: "/panel/alumnos" },
      { icon: Inbox, label: "Solicitudes nuevas", value: solicitudes.length, href: "/panel/solicitudes", destacar: solicitudes.length > 0 },
      // Plata de clases ya dadas que todavía no entró. Se muestra siempre para
      // que no se acumule sin que nadie lo note.
      {
        icon: Wallet,
        label: "Falta cobrar",
        value: pendienteCobro,
        href: "/panel/finanzas?tab=pendiente",
        destacar: pendienteCobro > 0,
        esPlata: true,
      },
    ];
  } else {
    const [todasMias, mis5, misClases, temas] = await Promise.all([
      getProximasClases(undefined, user.id),
      getProximasClases(5, user.id),
      getClasesDeProfe(user.id),
      getTemas(),
    ]);
    proximas = mis5;
    const alumnoIds = new Set<string>();
    misClases.forEach((c) => c.alumnoIds.forEach((a) => alumnoIds.add(a)));
    stats = [
      { icon: CalendarDays, label: "Mis próximas clases", value: todasMias.length, href: "/panel/agenda" },
      { icon: GraduationCap, label: "Mis alumnos", value: alumnoIds.size, href: "/panel/alumnos" },
      { icon: BookOpen, label: "Temas disponibles", value: temas.length, href: "/panel/temario" },
    ];
  }

  // Las tres tablas de una vez y se cruza en memoria, en lugar de pedir el
  // tema, el profe y cada alumno por separado para cada una de las próximas
  // clases. Son tablas chicas y cada consulta suelta cuesta un viaje a la base.
  const [temasTodos, usuariosTodos, alumnosTodos] = await Promise.all([
    getTemas(),
    getUsuarios(),
    getAlumnos(),
  ]);
  const temaPorId = new Map(temasTodos.map((t) => [t.id, t]));
  const usuarioPorId = new Map(usuariosTodos.map((u) => [u.id, u]));
  const alumnoPorId = new Map(alumnosTodos.map((a) => [a.id, a]));

  const proximasRows = proximas.map((c) => ({
    clase: c,
    temaTitulo: (c.temaId ? temaPorId.get(c.temaId) : undefined)?.titulo ?? "Tema",
    profeNombre:
      (c.profeId ? usuarioPorId.get(c.profeId) : undefined)?.nombre ?? "",
    nombresAlumnos: c.alumnoIds
      .map((aid) => alumnoPorId.get(aid)?.nombre)
      .filter(Boolean) as string[],
  }));

  return (
    <div className="space-y-8">
      <header className="animate-fade-up">
        <p className="text-sm capitalize text-cream/70">
          {fechaLarga(hoyEn(await zonaDelPanel()))}
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold text-cream">
          Hola, <span className="italic text-[#f3d9a6]">{primerNombre}</span>
        </h1>
        <p className="mt-2 max-w-xl text-cream/85">
          {esAdmin
            ? "Panel de gestión. Desde aquí administrás la agenda, los alumnos, el temario y la operación de la academia."
            : "Tu espacio de trabajo. Consultá tus próximas clases y el temario, y registrá el reporte de cada clase."}
        </p>
      </header>

      <section
        className={cn(
          "grid gap-4",
          esAdmin ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        {stats.map((s) => (
          <StatCard key={s.label} {...s} m={m} />
        ))}
      </section>

      <ActivarNotificaciones />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-cream">
            Próximas clases
          </h2>
          <Link
            href="/panel/agenda"
            className="inline-flex items-center gap-1 text-sm font-medium text-cream/90 transition-colors hover:text-white"
          >
            Ver agenda <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Card className="divide-y divide-line overflow-hidden">
          {proximasRows.length === 0 ? (
            <p className="p-6 text-sm text-ink-soft">No hay clases próximas.</p>
          ) : (
            proximasRows.map(
              ({ clase: c, temaTitulo, profeNombre, nombresAlumnos }) => (
                <div
                  key={c.id}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-blush-soft/20 sm:p-5"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-rose text-center ring-1 ring-line">
                    <span className="text-[10px] uppercase leading-none text-ink-muted">
                      {fechaCorta(c.fecha).split(" ")[0]}
                    </span>
                    <span className="font-display text-lg font-semibold leading-none text-ink">
                      {new Date(c.fecha).getUTCDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-ink">
                        {temaTitulo}
                      </p>
                      <Badge className="bg-beige/50 text-ink-soft">
                        {TIPO_CLASE_META[c.tipo].label}
                      </Badge>
                      {estaEnVivo(c.fecha, c.inicioMin, c.duracion, zona) ? (
                        <EnVivoBadge />
                      ) : (
                        <EstadoRealizacionIcono estado={c.estadoRealizacion} />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-soft">
                      <Clock className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
                      {minutosAHora(c.inicioMin)}
                      {esAdmin
                        ? ` · ${profeNombre} · ${nombresAlumnos.join(", ")}`
                        : ` · ${nombresAlumnos.length} alumno${nombresAlumnos.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
              ),
            )
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  destacar,
  esPlata,
  m,
}: {
  m: Moneda;
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  destacar?: boolean;
  esPlata?: boolean;
}) {
  return (
    <Link href={href}>
      <Card
        className={cn(
          "group p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift",
          destacar && "ring-1 ring-blush-deep/40",
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl",
              destacar
                ? "bg-blush text-ink"
                : "bg-blush-soft/70 text-blush-deep",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <ArrowRight className="h-4 w-4 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p
          className={cn(
            "mt-4 font-display font-semibold text-ink",
            esPlata ? "text-2xl" : "text-3xl",
          )}
        >
          {esPlata ? formatMoneda(value, m) : value}
        </p>
        <p className="text-sm text-ink-soft">{label}</p>
      </Card>
    </Link>
  );
}
