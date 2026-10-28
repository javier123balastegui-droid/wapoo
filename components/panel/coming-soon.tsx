import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ComingSoon({
  icon: Icon,
  titulo,
  fase,
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  fase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <div className="mb-6 flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-cream ring-1 ring-white/25">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold text-cream">
            {titulo}
          </h1>
          <Badge className="mt-1 bg-white/15 text-cream">{fase}</Badge>
        </div>
      </div>
      <Card className="p-7">
        <p className="leading-relaxed text-ink-soft">{children}</p>
        <div className="rule-copper mt-6 h-px w-full opacity-60" />
        <p className="mt-4 text-sm text-ink-muted">
          La sección ya tiene su lugar y su acceso según rol. La completamos en
          la fase indicada.
        </p>
      </Card>
    </div>
  );
}
