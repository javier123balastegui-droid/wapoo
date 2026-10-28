import { Badge, Dot } from "@/components/ui/badge";
import { ESTADO_PAGO_META } from "@/lib/constants";
import type { EstadoPago } from "@/lib/types";

export function EstadoPagoBadge({ estado }: { estado: EstadoPago }) {
  const meta = ESTADO_PAGO_META[estado];
  return (
    <Badge className={meta.badge}>
      <Dot className={meta.dot} />
      {meta.label}
    </Badge>
  );
}
