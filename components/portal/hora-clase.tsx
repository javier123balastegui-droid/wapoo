import { enZonaDelAlumno, etiquetaDeZona } from "@/lib/fechas";
import { minutosAHora } from "@/lib/utils";

/**
 * La hora de una clase como la ve el alumno.
 *
 * La clase se da en el horario de la academia (la agenda del profe es una
 * sola). Para un alumno de otra zona se muestra SU hora, y abajo la de la
 * academia, para que no haya dudas al coordinar.
 */
export function HoraClase({
  fecha,
  inicioMin,
  duracion,
  zona,
  zonaAcademia,
}: {
  fecha: string;
  inicioMin: number;
  duracion: number;
  zona?: string;
  zonaAcademia: string;
}) {
  const arg = `${minutosAHora(inicioMin)}–${minutosAHora(inicioMin + duracion)}`;
  if (!zona || zona === zonaAcademia) return <>{arg}</>;

  const desde = enZonaDelAlumno(fecha, inicioMin, zona, zonaAcademia);
  const hasta = enZonaDelAlumno(fecha, inicioMin + duracion, zona, zonaAcademia);
  return (
    <>
      {desde.hora}–{hasta.hora}
      <span className="text-ink-muted">
        {" "}
        (tu hora en {etiquetaDeZona(zona)} · {arg} en {etiquetaDeZona(zonaAcademia)})
      </span>
    </>
  );
}
