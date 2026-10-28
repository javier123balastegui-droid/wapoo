import { Power } from "lucide-react";
import type { ConfigBot, ModoBot, TipoEnvio } from "@/lib/bot/config";
import { guardarConfigBotAction } from "@/app/actions/bot-panel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MODOS: { valor: ModoBot; titulo: string; detalle: string }[] = [
  {
    valor: "APAGADO",
    titulo: "Apagado",
    detalle: "No sale ningún mensaje automático. Los chats quedan acá y te llega el aviso.",
  },
  {
    valor: "PRUEBA",
    titulo: "Prueba",
    detalle: "Solo les escribe a los números de prueba. A los demás no les manda nada.",
  },
  {
    valor: "ENCENDIDO",
    titulo: "Encendido",
    detalle: "Les escribe a todos, según las llaves de abajo.",
  },
];

const LLAVES: { nombre: TipoEnvio; titulo: string; detalle: string }[] = [
  {
    nombre: "responder",
    titulo: "Responder chats",
    detalle: "Contesta los mensajes de los alumnos (y coordina reagendas grupales).",
  },
  {
    nombre: "recordatorios",
    titulo: "Recordatorios de clase",
    detalle: "La noche anterior y el mismo día, a cada alumno con clase.",
  },
  {
    nombre: "post_clase",
    titulo: "Consulta post-clase",
    detalle: "Al día siguiente, les pregunta cómo les fue.",
  },
  {
    nombre: "agenda_profes",
    titulo: "Agenda a los profes",
    detalle: "Les avisa a los profes cuando se les asigna o cambia una clase.",
  },
];

/** Resumen de una línea de lo que el bot está haciendo ahora. */
function resumen(c: ConfigBot): string {
  if (c.modo === "APAGADO") return "Apagado: no sale ningún mensaje automático.";
  const prendidas = LLAVES.filter((l) => c[l.nombre]).map((l) => l.titulo.toLowerCase());
  if (prendidas.length === 0) return "Todas las llaves están apagadas: no sale nada.";
  if (c.modo === "PRUEBA") {
    if (c.numerosPrueba.length === 0) return "En prueba, pero sin números de prueba: no sale nada.";
    return `En prueba, solo con ${c.numerosPrueba.join(", ")}: ${prendidas.join(", ")}.`;
  }
  return `Encendido para todos: ${prendidas.join(", ")}.`;
}

/**
 * Panel de control del bot: modo, una llave por tipo de mensaje y los números
 * de prueba. Es un formulario común (sin JavaScript en el navegador): al
 * guardar, vale para el próximo mensaje.
 */
export function ControlBot({ config }: { config: ConfigBot }) {
  const apagado = config.modo === "APAGADO";
  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
            apagado ? "bg-pago-sena-bg text-pago-sena" : "bg-pago-ok-bg text-pago-ok"
          }`}
        >
          <Power className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-medium text-ink">Control del bot</h2>
          <p className="text-sm text-ink-soft">{resumen(config)}</p>
        </div>
      </div>

      <form action={guardarConfigBotAction} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">Modo</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODOS.map((m) => (
              <label
                key={m.valor}
                className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-blush-deep has-[:checked]:bg-blush-soft/30"
              >
                <input
                  type="radio"
                  name="modo"
                  value={m.valor}
                  defaultChecked={config.modo === m.valor}
                  className="mt-1 accent-blush-deep"
                />
                <span>
                  <span className="block font-medium text-ink">{m.titulo}</span>
                  <span className="block text-xs text-ink-soft">{m.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">
            Qué puede mandar (en Prueba o Encendido)
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LLAVES.map((l) => (
              <label
                key={l.nombre}
                className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-blush-deep"
              >
                <input
                  type="checkbox"
                  name={l.nombre}
                  defaultChecked={config[l.nombre]}
                  className="mt-1 accent-blush-deep"
                />
                <span>
                  <span className="block font-medium text-ink">{l.titulo}</span>
                  <span className="block text-xs text-ink-soft">{l.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="enlace_clase">Mensaje con el link de la clase</Label>
          <Textarea
            id="enlace_clase"
            name="enlace_clase"
            defaultValue={config.enlaceClase}
            rows={7}
            placeholder={"ACADEMIA DEMO\n…\nEnlace de la videollamada: https://meet.google.com/xxx-xxxx-xxx"}
          />
          <p className="text-xs text-ink-muted">
            El bot manda este texto tal como está, sin cambiarle nada: cuando
            confirma la seña, si el alumno lo pide, y el día de la clase. Si lo
            editás acá, lo usa desde el mensaje siguiente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="numeros_prueba">Números de prueba (uno por línea; ej: 260 423-2770)</Label>
          <Textarea
            id="numeros_prueba"
            name="numeros_prueba"
            rows={3}
            defaultValue={config.numerosPrueba.join("\n")}
            placeholder="260 423-2770"
          />
          <p className="text-xs text-ink-muted">
            Lo que escribas a mano desde un chat sale siempre, esté como esté el bot.
          </p>
        </div>

        <Button type="submit" size="sm">
          Guardar
        </Button>
      </form>
    </Card>
  );
}
