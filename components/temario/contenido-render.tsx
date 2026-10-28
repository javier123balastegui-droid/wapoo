import * as React from "react";

/**
 * Renderiza el contenido de un tema preservando la estructura:
 * - Líneas que empiezan con "- " o "•" → lista con viñetas.
 * - Líneas que terminan en ":" → subtítulo.
 * - El resto → párrafos.
 */
export function ContenidoRender({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (bullets.length) {
      const actuales = bullets;
      blocks.push(
        <ul key={`l-${key++}`} className="my-2 space-y-1.5">
          {actuales.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-ink-soft">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blush-deep" />
              <span>{it}</span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-•]\s+/, ""));
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    if (/:\s*$/.test(line)) {
      blocks.push(
        <p key={`h-${key++}`} className="mt-4 font-medium text-ink first:mt-0">
          {line}
        </p>,
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="leading-relaxed text-ink-soft">
          {line}
        </p>,
      );
    }
  }
  flush();

  return <div className="space-y-1.5">{blocks}</div>;
}
