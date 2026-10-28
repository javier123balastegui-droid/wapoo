import Link from "next/link";
import { Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  getPagos,
  getAlumnos,
  getClases,
  getTemas,
  getProfes,
  getTarifaDeProfe,
  getClasesEnMes,
  getPrecios,
  getCobrosPendientes,
} from "@/lib/mock-data";
import { TIPO_CLASE_META } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  actualizarTarifaAction,
  actualizarPreciosAction,
} from "@/app/actions/finanzas";
import { actualizarPagoAction } from "@/app/actions/agenda";
import { formatMoneda, fechaCorta, cn } from "@/lib/utils";
import { mesActualEn, nombreMesAnio, sumarMes, hoyEn } from "@/lib/fechas";
import { enHoras, pagoProfe, duracionLabel } from "@/lib/precios";
import { monedaDelPanel } from "@/lib/organizacion-peticion";
import type { Moneda } from "@/lib/utils";
import { zonaDelPanel } from "@/lib/organizacion-peticion";

/** "2" / "1,5" — para mostrar las horas dictadas sin decimales de más. */
function formatHoras(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
}

type Tab = "pendiente" | "cobros" | "liquidacion" | "precios";

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; estado?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "liquidacion"
      ? "liquidacion"
      : sp.tab === "precios"
        ? "precios"
        : sp.tab === "cobros"
          ? "cobros"
          : "pendiente";
  const mes = typeof sp.mes === "string" ? sp.mes : mesActualEn(await zonaDelPanel());
  const estado = typeof sp.estado === "string" ? sp.estado : "";

  return (
    <div className="space-y-6">
      <header>
        <p className="flex items-center gap-1.5 text-xs font-medium text-cream/80">
          <Lock className="h-3.5 w-3.5" /> Sección exclusiva de administración.
          Los profesores no tienen acceso.
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold text-cream">
          Finanzas
        </h1>
      </header>

      <div className="inline-flex flex-wrap rounded-full border border-white/25 bg-white/10 p-1">
        <TabLink tab="pendiente" actual={tab} mes={mes} label="Falta cobrar" />
        <TabLink tab="cobros" actual={tab} mes={mes} label="Todos los pagos" />
        <TabLink
          tab="liquidacion"
          actual={tab}
          mes={mes}
          label="Liquidación a profesores"
        />
        <TabLink tab="precios" actual={tab} mes={mes} label="Precios" />
      </div>

      {tab === "pendiente" ? (
        <FaltaCobrar />
      ) : tab === "cobros" ? (
        <Cobros estado={estado} />
      ) : tab === "liquidacion" ? (
        <Liquidacion mes={typeof sp.mes === "string" ? sp.mes : null} />
      ) : (
        <Precios />
      )}
    </div>
  );
}

function TabLink({
  tab,
  actual,
  mes,
  label,
}: {
  tab: Tab;
  actual: Tab;
  mes: string;
  label: string;
}) {
  const activo = tab === actual;
  return (
    <Link
      href={`/panel/finanzas?tab=${tab}&mes=${mes}`}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        activo ? "bg-cream text-ink shadow-soft" : "text-cream/85 hover:text-white",
      )}
    >
      {label}
    </Link>
  );
}

function FiltroChip({
  estado,
  actual,
  label,
}: {
  estado: string;
  actual: string;
  label: string;
}) {
  const activo = estado === actual;
  return (
    <Link
      href={`/panel/finanzas?tab=cobros${estado ? `&estado=${estado}` : ""}`}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        activo
          ? "bg-cream text-ink shadow-soft"
          : "border border-white/25 bg-white/10 text-cream/85 hover:text-white",
      )}
    >
      {label}
    </Link>
  );
}

function StatMoney({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "sena" | "sin";
}) {
  const dot =
    tone === "ok" ? "bg-pago-ok" : tone === "sena" ? "bg-pago-sena" : "bg-pago-sin";
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
    </Card>
  );
}

/**
 * "Falta cobrar": plata de clases YA DADAS que todavía no entró.
 *
 * Es la pantalla para ponerse al día: agrupa por alumna, muestra cuánto debe
 * cada una y desde cuándo, y con un toque se marca la clase como cobrada.
 * A diferencia de "Todos los pagos", acá NO aparecen las clases futuras (una
 * clase que viene, señada, está perfecta: no hay nada que perseguir).
 */
async function FaltaCobrar() {
  const m = await monedaDelPanel();
  const pendientes = await getCobrosPendientes();
  const total = pendientes.reduce((s, p) => s + p.falta, 0);

  // Agrupadas por alumna, la que hace más tiempo que debe primero.
  const porAlumna = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const lista = porAlumna.get(p.alumnoId) ?? [];
    lista.push(p);
    porAlumna.set(p.alumnoId, lista);
  }
  // La alumna que hace más tiempo que debe, primero.
  const grupos = [...porAlumna.values()].sort(
    (a, b) => b[0].diasDesde - a[0].diasDesde,
  );

  if (pendientes.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-xl font-semibold text-ink">
          ¡Está todo cobrado! 🎉
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">
          No queda plata pendiente de las clases que ya se dieron.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatMoney label="Total a cobrar" value={formatMoneda(total, m)} tone="sin" />
        <StatMoney
          label={`${grupos.length} ${grupos.length === 1 ? "alumna" : "alumnas"} · ${pendientes.length} ${pendientes.length === 1 ? "clase" : "clases"}`}
          value={`hace ${grupos[0][0].diasDesde} días`}
          tone="sena"
        />
      </div>

      <p className="text-sm text-cream/85">
        Clases que <strong className="font-semibold">ya se dieron</strong> y
        todavía no se cobraron del todo. Las canceladas y reagendadas no cuentan.
        Tocá “Cobré todo” cuando recibas la plata.
      </p>

      <div className="space-y-3">
        {grupos.map((clases) => {
          const totalAlumna = clases.reduce((s, c) => s + c.falta, 0);
          return (
            <Card key={clases[0].alumnoId} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-rose/40 px-4 py-3">
                <Link
                  href={`/panel/alumnos/${clases[0].alumnoId}`}
                  className="font-medium text-ink transition-colors hover:text-blush-deep"
                >
                  {clases[0].alumnoNombre}
                </Link>
                <span className="font-display text-lg font-semibold text-ink">
                  {formatMoneda(totalAlumna, m)}
                </span>
              </div>

              <div className="divide-y divide-line">
                {clases.map((c) => (
                  <div
                    key={`${c.claseId}-${c.alumnoId}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {c.temaTitulo}
                        <span className="text-ink-muted">
                          {" "}
                          · {fechaCorta(c.fecha)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {TIPO_CLASE_META[c.tipo].label} ·{" "}
                        {duracionLabel(c.duracion)} · hace {c.diasDesde}{" "}
                        {c.diasDesde === 1 ? "día" : "días"}
                        {c.yaPago > 0
                          ? ` · señó ${formatMoneda(c.yaPago, m)} de ${formatMoneda(c.precioTotal, m)}`
                          : " · no señó"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-pago-sin">
                        {formatMoneda(c.falta, m)}
                      </span>
                      <form action={actualizarPagoAction}>
                        <input type="hidden" name="claseId" value={c.claseId} />
                        <input type="hidden" name="alumnoId" value={c.alumnoId} />
                        <input type="hidden" name="estado" value="PAGADO" />
                        <Button type="submit" variant="outline" size="sm">
                          Cobré todo
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

async function Cobros({ estado }: { estado: string }) {
  const m = await monedaDelPanel();
  const pagos = await getPagos();
  const totalPagado = pagos
    .filter((p) => p.estado === "PAGADO")
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const totalSenas = pagos
    .filter((p) => p.estado === "SENADO")
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const sinPagar = pagos.filter((p) => p.estado === "SIN_PAGAR").length;

  // Las tablas que hacen falta, de una vez, y se cruza en memoria.
  //
  // Antes esto pedía, POR CADA PAGO, el alumno, la clase y el tema. Con 360
  // pagos eran más de mil consultas para abrir Finanzas, cada una pagando su
  // viaje a la base. Es el mismo problema que tenía la agenda.
  const [alumnosTodos, clasesTodas, temasTodos] = await Promise.all([
    getAlumnos(),
    getClases(),
    getTemas(),
  ]);
  const alumnoPorId = new Map(alumnosTodos.map((a) => [a.id, a]));
  const clasePorId = new Map(clasesTodas.map((c) => [c.id, c]));
  const temaPorId = new Map(temasTodos.map((t) => [t.id, t]));

  const filasRaw = pagos.map((p) => {
    const clase = clasePorId.get(p.claseId);
    const tema = clase?.temaId ? temaPorId.get(clase.temaId) : undefined;
    return {
      id: p.id,
      claseId: p.claseId,
      alumnoId: p.alumnoId,
      estado: p.estado,
      monto: p.monto,
      alumnoNombre: alumnoPorId.get(p.alumnoId)?.nombre ?? "—",
      temaTitulo: tema?.titulo ?? "Clase",
      fechaClase: clase?.fecha,
    };
  });
  const filas = filasRaw
    .filter((f) => !estado || f.estado === estado)
    .sort((a, b) => (b.fechaClase ?? "").localeCompare(a.fechaClase ?? ""));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatMoney label="Cobrado (completo)" value={formatMoneda(totalPagado, m)} tone="ok" />
        <StatMoney label="Señas recibidas" value={formatMoneda(totalSenas, m)} tone="sena" />
        <StatMoney label="Sin seña" value={`${sinPagar} clases`} tone="sin" />
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroChip estado="" actual={estado} label="Todos" />
        <FiltroChip estado="SIN_PAGAR" actual={estado} label="Sin seña" />
        <FiltroChip estado="SENADO" actual={estado} label="Señaron" />
        <FiltroChip estado="PAGADO" actual={estado} label="Pagaron" />
      </div>

      <Card className="overflow-hidden">
        {filas.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">
            No hay pagos en este grupo.
          </p>
        ) : (
          <div className="divide-y divide-line">
          {filas.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{f.alumnoNombre}</p>
                <p className="text-xs text-ink-muted">
                  {f.temaTitulo}
                  {f.fechaClase && ` · ${fechaCorta(f.fechaClase)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {f.monto != null && (
                  <span className="text-sm font-medium text-ink">
                    {formatMoneda(f.monto, m)}
                  </span>
                )}
                <form
                  action={actualizarPagoAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="claseId" value={f.claseId} />
                  <input type="hidden" name="alumnoId" value={f.alumnoId} />
                  <Select
                    name="estado"
                    defaultValue={f.estado}
                    className="h-9 w-auto"
                  >
                    <option value="SIN_PAGAR">Sin seña</option>
                    <option value="SENADO">Señó</option>
                    <option value="PAGADO">Pagó completo</option>
                  </Select>
                  <Button type="submit" variant="outline" size="sm">
                    Guardar
                  </Button>
                </form>
              </div>
            </div>
          ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Las filas de liquidación de un conjunto de clases, una por profe. */
async function filasDeLiquidacion(clases: Awaited<ReturnType<typeof getClasesEnMes>>) {
  const profes = await getProfes();
  return Promise.all(
    profes.map(async (p) => {
      const suyas = clases.filter((c) => c.profeId === p.id);
      const tarifa = await getTarifaDeProfe(p.id);

      // Las que se dieron (o todavía no se marcaron) se pagan por hora; las que
      // se cayeron a último momento pagan una compensación fija; las
      // reagendadas no se pagan acá (se pagan en su fecha nueva).
      const dictadas = suyas.filter(
        (c) =>
          c.estadoRealizacion === "REALIZADA" || c.estadoRealizacion === "PENDIENTE",
      );
      const caidas = suyas.filter(
        (c) => c.estadoRealizacion === "CANCELADA" || c.estadoRealizacion === "AUSENTE",
      );
      const deGrupal = dictadas.filter((c) => c.tipo === "GRUPAL");
      const deIndividual = dictadas.filter((c) => c.tipo === "INDIVIDUAL");
      const totalDictadas = dictadas.reduce(
        (acc, c) => acc + pagoProfe(tarifa, c.tipo, c.duracion, c.estadoRealizacion),
        0,
      );
      const totalCaidas = caidas.reduce(
        (acc, c) => acc + pagoProfe(tarifa, c.tipo, c.duracion, c.estadoRealizacion),
        0,
      );

      return {
        p,
        grupales: deGrupal.length,
        individuales: deIndividual.length,
        horasGrupal: deGrupal.reduce((acc, c) => acc + enHoras(c.duracion), 0),
        horasIndividual: deIndividual.reduce((acc, c) => acc + enHoras(c.duracion), 0),
        caidas: caidas.length,
        totalDictadas,
        totalCaidas,
        vG: tarifa?.valorGrupal ?? 0,
        vI: tarifa?.valorIndividual ?? 0,
        vCI: tarifa?.valorCanceladaIndividual ?? 2500,
        vCG: tarifa?.valorCanceladaGrupal ?? 4000,
        total: totalDictadas + totalCaidas,
      };
    }),
  );
}

type FilaLiquidacion = Awaited<ReturnType<typeof filasDeLiquidacion>>[number];

/**
 * Liquidación a los profesores, mes por mes.
 *
 * Sin elegir mes se ven los dos que importan para pagar: el mes anterior
 * completo (lo que corresponde liquidar) y lo que va del mes actual, contando
 * solo las clases que YA se dieron. Con las flechas se mira cualquier otro mes.
 */
async function Liquidacion({ mes }: { mes: string | null }) {
  if (mes) return <LiquidacionDeUnMes mes={mes} />;

  const actual = mesActualEn(await zonaDelPanel());
  const anterior = sumarMes(actual, -1);
  const hoy = hoyEn(await zonaDelPanel());
  const [clasesActual, clasesAnterior] = await Promise.all([
    getClasesEnMes(actual),
    getClasesEnMes(anterior),
  ]);
  // Del mes en curso, solo lo que ya pasó: una clase que todavía no se dio no
  // se liquida.
  const [filasActual, filasAnterior] = await Promise.all([
    filasDeLiquidacion(clasesActual.filter((c) => c.fecha <= hoy)),
    filasDeLiquidacion(clasesAnterior),
  ]);

  return (
    <div className="space-y-8">
      <BloqueLiquidacion
        m={await monedaDelPanel()}
        titulo={`${nombreMesAnio(anterior)} — a liquidar`}
        detalle="Mes cerrado: esto es lo que corresponde pagarle al profe."
        filas={filasAnterior}
        conTarifas
      />
      <BloqueLiquidacion
        m={await monedaDelPanel()}
        titulo={`${nombreMesAnio(actual)} — en curso`}
        detalle={`Lo que va del mes, con las clases dadas hasta hoy (${fechaCorta(hoy)}).`}
        filas={filasActual}
      />
      <Link
        href={`/panel/finanzas?tab=liquidacion&mes=${sumarMes(anterior, -1)}`}
        className="inline-flex items-center gap-1 text-sm text-cream/85 hover:text-cream hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> Ver meses anteriores
      </Link>
    </div>
  );
}

/** Un mes puntual, completo, con flechas para moverse. */
async function LiquidacionDeUnMes({ mes }: { mes: string }) {
  const m = await monedaDelPanel();
  const filas = await filasDeLiquidacion(await getClasesEnMes(mes));
  const total = filas.reduce((acc, f) => acc + f.total, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/panel/finanzas?tab=liquidacion&mes=${sumarMes(mes, -1)}`}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-cream transition-colors hover:bg-white/20"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-40 text-center font-medium capitalize text-cream">
            {nombreMesAnio(mes)}
          </span>
          <Link
            href={`/panel/finanzas?tab=liquidacion&mes=${sumarMes(mes, 1)}`}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-cream transition-colors hover:bg-white/20"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-cream/85">
            Total: <span className="font-semibold text-cream">{formatMoneda(total, m)}</span>
          </p>
          <Link
            href="/panel/finanzas?tab=liquidacion"
            className="text-sm text-cream/85 hover:text-cream hover:underline"
          >
            Volver
          </Link>
        </div>
      </div>
      <BloqueLiquidacion m={m} titulo="" detalle="" filas={filas} conTarifas />
    </div>
  );
}

function BloqueLiquidacion({
  titulo,
  detalle,
  filas,
  conTarifas = false,
  m,
}: {
  m: Moneda;
  titulo: string;
  detalle: string;
  filas: FilaLiquidacion[];
  /** Las tarifas se editan una sola vez por pantalla, en el bloque principal. */
  conTarifas?: boolean;
}) {
  const totalGeneral = filas.reduce((acc, f) => acc + f.total, 0);

  return (
    <div className="space-y-4">
      {titulo && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold capitalize text-cream">
              {titulo}
            </h2>
            <p className="text-sm text-cream/85">{detalle}</p>
          </div>
          <p className="text-cream/85">
            Total:{" "}
            <span className="font-semibold text-cream">{formatMoneda(totalGeneral, m)}</span>
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filas.map((f) => (
          <Card key={f.p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{f.p.nombre}</p>
                {f.grupales + f.individuales + f.caidas === 0 ? (
                  <p className="text-sm text-ink-muted">Sin clases en este período.</p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    {f.grupales} grupales ({formatHoras(f.horasGrupal)} h) ·{" "}
                    {f.individuales} individuales ({formatHoras(f.horasIndividual)} h) ={" "}
                    {formatMoneda(f.totalDictadas, m)}
                  </p>
                )}
                {f.caidas > 0 && (
                  <p className="text-sm text-ink-soft">
                    + {f.caidas} {f.caidas === 1 ? "clase caída" : "clases caídas"}{" "}
                    (canceló o no se conectó) = {formatMoneda(f.totalCaidas, m)}
                  </p>
                )}
              </div>
              <p className="font-display text-2xl font-semibold text-ink">
                {formatMoneda(f.total, m)}
              </p>
            </div>

            {conTarifas && (
              <form
                action={actualizarTarifaAction}
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4"
              >
                <input type="hidden" name="profeId" value={f.p.id} />
                <div className="space-y-1">
                  <label className="text-xs text-ink-muted">
                    Tarifa grupal $ (por hora)
                  </label>
                  <Input
                    name="valorGrupal"
                    type="number"
                    min="0"
                    defaultValue={f.vG}
                    className="h-9 w-32"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-muted">
                    Tarifa individual $ (por hora)
                  </label>
                  <Input
                    name="valorIndividual"
                    type="number"
                    min="0"
                    defaultValue={f.vI}
                    className="h-9 w-32"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-muted">
                    Clase caída individual $
                  </label>
                  <Input
                    name="valorCanceladaIndividual"
                    type="number"
                    min="0"
                    defaultValue={f.vCI}
                    className="h-9 w-32"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-muted">Clase caída grupal $</label>
                  <Input
                    name="valorCanceladaGrupal"
                    type="number"
                    min="0"
                    defaultValue={f.vCG}
                    className="h-9 w-32"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  Guardar tarifa
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

async function Precios() {
  const precios = await getPrecios();
  return (
    <Card className="max-w-xl p-6">
      <h2 className="font-display text-xl font-semibold text-ink">
        Precios de las clases
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Definí cuánto sale cada clase y la seña. Podés actualizarlo cuando
        quieras; se guarda al instante.
      </p>
      <div className="rule-copper my-4 h-px w-full opacity-60" />
      <form action={actualizarPreciosAction} className="space-y-4">
        <CampoPrecio
          label="Clase individual"
          name="valorIndividual"
          value={precios.valorIndividual}
        />
        <CampoPrecio
          label="Clase grupal de 2 (precio por alumno)"
          name="valorGrupal2"
          value={precios.valorGrupal2}
        />
        <CampoPrecio
          label="Clase grupal de 3 o más (precio por alumno)"
          name="valorGrupal3"
          value={precios.valorGrupal3}
        />
        <CampoPrecio
          label="Seña (igual para individual y grupal)"
          name="valorSena"
          value={precios.valorSena}
        />
        <Button type="submit">Guardar precios</Button>
      </form>
    </Card>
  );
}

function CampoPrecio({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-ink-soft">$</span>
        <Input
          name={name}
          type="number"
          min="0"
          step="1"
          defaultValue={value || ""}
          placeholder="0"
          className="w-44"
        />
      </div>
    </div>
  );
}
