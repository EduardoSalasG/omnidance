"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  ImportResultsTable,
  StatusCounts,
  kindLabel,
  type RowResult,
} from "@/components/academy/import-section";
import { useDateFmt } from "@/lib/intl";

type ImportRunDetail = {
  id: string;
  kind: string;
  fileName: string | null;
  total: number;
  counts: Record<string, number>;
  results: RowResult[];
  createdAt: string;
};

/**
 * /academia/configuracion/importar/[runId] - ficha de una corrida del
 * historial (spec academies/bulk-import): metadatos, conteos por
 * status y detalle fila a fila. Solo lectura: la corrida ya pasó, no
 * hay acciones.
 */
export default function ImportRunPage() {
  const t = useTranslations("academyImport");
  const params = useParams<{ runId: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/importar"
        backLabel={t("title")}
      />
      <AcademyGate>
        {({ academy }) => (
          <RunDetail
            key={`${academy.id}:${params.runId}`}
            academyId={academy.id}
            runId={params.runId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function RunDetail({
  academyId,
  runId,
}: {
  academyId: string;
  runId: string;
}) {
  const t = useTranslations("academyImport");
  const tc = useTranslations("common");
  const dateFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const [run, setRun] = useState<ImportRunDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setNotFound(false);
    const res = await apiFetch(
      `/academies/${academyId}/import/runs/${runId}`,
    ).catch(() => null);
    if (
      res &&
      (res.status === 401 || res.status === 403 || res.status === 404)
    ) {
      // Inexistente o de otra academia (404) / sin cap (401/403):
      // estado "no encontrada" con salida - no es error reintentable.
      setNotFound(true);
      return;
    }
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as { run: ImportRunDetail };
    setRun(body.run);
  }, [academyId, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (notFound) {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("notFound")}</p>
        <Button
          href="/academia/configuracion/importar"
          variant="secondary"
          size="sm"
        >
          {tc("back")}
        </Button>
      </Card>
    );
  }
  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!run) return <SkeletonList items={2} />;

  const results = Array.isArray(run.results) ? run.results : [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            {run.fileName ?? kindLabel(t, run.kind)}
          </h2>
          {run.fileName && (
            <Badge variant="muted">{kindLabel(t, run.kind)}</Badge>
          )}
        </div>
        <Card className="flex flex-col gap-3 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink/50">{t("fieldDate")}</dt>
              <dd className="tabular-nums text-ink/70">
                {dateFmt.format(new Date(run.createdAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldKind")}</dt>
              <dd className="font-medium">{kindLabel(t, run.kind)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldFile")}</dt>
              <dd className="font-medium">{run.fileName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldRows")}</dt>
              <dd className="font-medium tabular-nums">
                {t("rowsTotal", { count: run.total })}
              </dd>
            </div>
          </dl>
          <StatusCounts counts={run.counts} />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
          {t("resultsTitle")}
        </h3>
        <div className="overflow-x-auto">
          <ImportResultsTable results={results} />
        </div>
      </section>
    </div>
  );
}
