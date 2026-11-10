"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { showActionNotice } from "@/components/ui/action-notice";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  LIST_PREVIEW,
  RefreshIcon,
  SeeAllRow,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";
import { readError } from "./shared";

export type RowResult = {
  row: number;
  email?: string;
  serie?: string;
  status: string;
  detail: string;
};

export type ImportRunSummary = {
  id: string;
  kind: string;
  fileName: string | null;
  total: number;
  counts: Record<string, number>;
  createdAt: string;
};

const STATUS_VARIANT: Record<
  string,
  "neon" | "outline" | "live" | "muted" | "warn"
> = {
  invited: "neon",
  ok: "neon",
  resent: "outline",
  warn: "warn",
  skipped: "muted",
  error: "live",
};

// Orden fijo de los chips de conteo: éxitos primero, error al final.
const STATUS_ORDER = ["invited", "resent", "skipped", "ok", "warn", "error"];

// La tabla de resultados es transitoria (feedback de la carga que
// acaba de correr): preview de 10 filas + "Ver todo" expande, sin
// scroll container ni paginación (design console-audit-fixes §11).
const RESULTS_PREVIEW = 10;

/** Label del kind con fallback al valor crudo (kind nuevo del API). */
export function kindLabel(
  t: { (key: string): string; has: (key: string) => boolean },
  kind: string,
): string {
  return t.has(`${kind}Title`) ? t(`${kind}Title`) : kind;
}

function countByStatus(results: RowResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/** Chips de conteo por status (preview, resumen e historial). */
export function StatusCounts({ counts }: { counts: Record<string, number> }) {
  const t = useTranslations("academyImport");
  const entries = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((s) => (
        <Badge key={s} variant={STATUS_VARIANT[s] ?? "muted"}>
          {t.has(`status.${s}`) ? t(`status.${s}`) : s} {counts[s]}
        </Badge>
      ))}
    </div>
  );
}

/** Tabla fila a fila compartida entre el resultado del card y la ficha. */
export function ImportResultsTable({ results }: { results: RowResult[] }) {
  const t = useTranslations("academyImport");
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs text-ink/40">
          <th className="pr-3 font-medium">{t("colRow")}</th>
          <th className="pr-3 font-medium">{t("colItem")}</th>
          <th className="pr-3 font-medium">{t("colStatus")}</th>
          <th className="font-medium">{t("colDetail")}</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.row} className="border-t border-line align-top">
            <td className="py-2 pr-3 tabular-nums text-ink/50">{r.row}</td>
            <td className="py-2 pr-3">{r.email ?? r.serie ?? "—"}</td>
            <td className="py-2 pr-3">
              <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                {t.has(`status.${r.status}`)
                  ? t(`status.${r.status}`)
                  : r.status}
              </Badge>
            </td>
            <td className="py-2 text-ink/60">{r.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Phase = "idle" | "validating" | "preview" | "importing" | "done";

// Card de carga masiva CSV (spec academy-bulk-import +
// academy-import-invites): flujo en dos pasos - "Validar" corre la
// misma tubería con ?dryRun=1 (sin escrituras ni envíos) y muestra la
// vista previa; "Importar" confirma la corrida real. Cambiar el archivo
// invalida la validación. Ambas clases de importación
// (students/schedule) se agrupan en /academia/configuracion/importar -
// son setup de una vez, no operación diaria. El host la muestra según
// la capacidad del viewer (students/schedule); el backend gatea igual
// en /import/:kind.
export function ImportCard({
  academyId,
  kind,
  onImported,
}: {
  academyId: string;
  kind: "students" | "schedule";
  /** Se llama tras una corrida real exitosa - el host refresca el historial. */
  onImported?: () => void;
}) {
  const t = useTranslations("academyImport");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  const busy = phase === "validating" || phase === "importing";

  async function upload(dryRun: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    setPhase(dryRun ? "validating" : "importing");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(
        `/academies/${academyId}/import/${kind}${dryRun ? "?dryRun=1" : ""}`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        showActionNotice({
          text: (await readError(res)) ?? t("error"),
          error: true,
        });
        // En fallo del import real se conserva la vista previa para
        // reintentar; en fallo de la validación se vuelve a idle.
        setPhase(dryRun ? "idle" : "preview");
        if (dryRun) setResults(null);
        return;
      }
      const body = (await res.json()) as {
        results: RowResult[];
        errors: { row: number; message: string }[];
      };
      setResults(body.results);
      setExpanded(false);
      if (dryRun) {
        setPhase("preview");
      } else {
        setPhase("done");
        showActionNotice({
          text: body.errors.length
            ? t("importDoneErrors", { errors: body.errors.length })
            : t("importDone"),
        });
        onImported?.();
      }
    } catch {
      showActionNotice({ text: t("error"), error: true });
      setPhase(dryRun ? "idle" : "preview");
      if (dryRun) setResults(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t(`${kind}Title`)}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t(`${kind}Desc`)}</p>
        <p className="mt-1 text-xs text-ink/40">{t(`${kind}Cols`)}</p>
        {/* Muestra de valores aceptados por columna (spec
            academies/bulk-import): solo las columnas con formato
            restringido, antes de "Descargar plantilla". */}
        <dl className="mt-2 flex flex-col gap-1">
          {(t.raw(`${kind}Values`) as { col: string; values: string }[]).map(
            (v) => (
              <div key={v.col} className="flex gap-2 text-xs">
                <dt className="shrink-0 font-mono text-ink/50">{v.col}</dt>
                <dd className="min-w-0 text-ink/40">{v.values}</dd>
              </div>
            ),
          )}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/academies/${academyId}/import/template/${kind}`}
          className="inline-flex min-h-11 items-center text-sm text-neon underline-offset-2 hover:underline"
        >
          {t("downloadTemplate")}
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label={t("chooseFile")}
          onChange={(e) => {
            // Archivo nuevo = validación previa inválida: vuelve a idle.
            setFileName(e.target.files?.[0]?.name ?? null);
            setPhase("idle");
            setResults(null);
            setExpanded(false);
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          {t("chooseFile")}
        </Button>
        <span className="text-xs text-ink/50">
          {fileName ?? t("noFile")}
        </span>
        <Button
          size="sm"
          disabled={!fileName || busy}
          onClick={() => void upload(phase === "preview" ? false : true)}
        >
          {busy ? <Spinner size="sm" /> : null}
          {phase === "validating"
            ? t("validating")
            : phase === "importing"
              ? t("uploading")
              : phase === "preview"
                ? t("upload")
                : t("validate")}
        </Button>
      </div>
      {results && (
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
            {phase === "preview" ? t("previewTitle") : t("resultsTitle")}
          </h3>
          {phase === "preview" && (
            <p className="mb-2 text-xs text-ink/50">{t("previewHint")}</p>
          )}
          <div className="mb-2">
            <StatusCounts counts={countByStatus(results)} />
          </div>
          <ImportResultsTable
            results={results.slice(0, expanded ? undefined : RESULTS_PREVIEW)}
          />
          {/* SeeAllRow es un <li> (patrón de lista en fichas); en una
              tabla va fuera de <table> dentro de su propio <ul> para
              conservar el mismo control "Ver todo". */}
          <ul>
            <SeeAllRow
              total={results.length}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              preview={RESULTS_PREVIEW}
            />
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * Historial de corridas (spec academies/bulk-import): lista las
 * AcademyImportRun de la academia (students + schedule), cada fila
 * navega a la ficha /academia/configuracion/importar/[runId] con el
 * detalle fila a fila. El padre sube refreshKey tras cada corrida real
 * para que la corrida nueva aparezca sin recargar.
 */
export function ImportHistory({
  academyId,
  refreshKey,
}: {
  academyId: string;
  refreshKey: number;
}) {
  const t = useTranslations("academyImport");
  const tc = useTranslations("common");
  const dateFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const [runs, setRuns] = useState<ImportRunSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await apiFetch(`/academies/${academyId}/import/runs`).catch(
      () => null,
    );
    if (!res?.ok) {
      setRuns([]);
      setError(true);
      return;
    }
    const body = (await res.json()) as { items: ImportRunSummary[] };
    setRuns(body.items);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <h2 className="px-5 pt-5 text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("historyTitle")}
      </h2>
      {error ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : runs === null ? (
        <div className="px-5 pb-5 pt-3">
          <SkeletonList items={2} lines={1} />
        </div>
      ) : runs.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-sm text-ink/50">
          {t("historyEmpty")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {runs
            .slice(0, expanded ? undefined : LIST_PREVIEW)
            .map((run) => (
            <li key={run.id}>
              <Link
                href={`/academia/configuracion/importar/${run.id}`}
                className="flex min-h-11 items-center gap-3 px-5 py-3 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium">
                    {run.fileName ?? kindLabel(t, run.kind)}
                  </p>
                  <p className="text-xs tabular-nums text-ink/50">
                    {kindLabel(t, run.kind)} ·{" "}
                    {dateFmt.format(new Date(run.createdAt))} ·{" "}
                    {t("rowsTotal", { count: run.total })}
                  </p>
                  <StatusCounts counts={run.counts} />
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
              </Link>
            </li>
          ))}
          <SeeAllRow
            total={runs.length}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        </ul>
      )}
    </Card>
  );
}

/**
 * /academia/configuracion/importar agrupa las cargas masivas en una sola
 * página de Configuración (antes embebidas en alumnos / series).
 */
