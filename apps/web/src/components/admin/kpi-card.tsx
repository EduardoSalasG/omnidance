import { Card } from "@/components/ui";

/** KPI card del header - label + monto + desglose breve. Extraído de
    /admin/finanzas para las páginas de la sección Facturación. */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] leading-snug text-ink/40">{hint}</p>}
    </Card>
  );
}
