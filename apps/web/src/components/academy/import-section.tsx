"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { readError } from "./shared";
import { useAcademyAccess } from "./use-academy-access";

type RowResult = {
  row: number;
  email?: string;
  serie?: string;
  status: string;
  detail: string;
};

const STATUS_VARIANT: Record<
  string,
  "neon" | "outline" | "live" | "muted"
> = {
  imported: "neon",
  invited: "neon",
  ok: "neon",
  updated: "outline",
  warn: "outline",
  error: "live",
};

function ImportCard({
  academyId,
  kind,
}: {
  academyId: string;
  kind: "students" | "schedule";
}) {
  const t = useTranslations("academyImport");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/academies/${academyId}/import/${kind}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        setResults(null);
        return;
      }
      const body = (await res.json()) as { results: RowResult[] };
      setResults(body.results);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t(`${kind}Title`)}
        </h2>
        <p className="mt-1 text-xs text-white/50">{t(`${kind}Desc`)}</p>
        <p className="mt-1 text-xs text-white/40">{t(`${kind}Cols`)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid -- link directo a CSV descargable */}
        <a
          href={`/api/academies/${academyId}/import/template/${kind}`}
          className="text-sm text-neon underline-offset-2 hover:underline"
        >
          {t("downloadTemplate")}
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label={t("chooseFile")}
          onChange={(e) =>
            setFileName(e.target.files?.[0]?.name ?? null)
          }
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          {t("chooseFile")}
        </Button>
        <span className="text-xs text-white/50">
          {fileName ?? t("noFile")}
        </span>
        <Button
          size="sm"
          disabled={!fileName || busy}
          onClick={() => void upload()}
        >
          {busy ? t("uploading") : t("upload")}
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      {results && (
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            {t("resultsTitle")}
          </h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-white/40">
                <th className="pr-3 font-medium">{t("colRow")}</th>
                <th className="pr-3 font-medium">{t("colItem")}</th>
                <th className="pr-3 font-medium">{t("colStatus")}</th>
                <th className="font-medium">{t("colDetail")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-night-700 align-top">
                  <td className="py-2 pr-3 text-white/50">{r.row}</td>
                  <td className="py-2 pr-3">{r.email ?? r.serie ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>
                      {t(`status.${r.status}`)}
                    </Badge>
                  </td>
                  <td className="py-2 text-white/60">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * /academia/importar - carga masiva para migración (spec
 * academy-bulk-import). Cada card se muestra según la capacidad del
 * viewer (`students` / `schedule`); el backend gatea igual.
 */
export function ImportSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyImport");
  const access = useAcademyAccess(academyId);

  const canStudents = access?.caps.students === true;
  const canSchedule = access?.caps.schedule === true;

  if (access !== null && !canStudents && !canSchedule) {
    return <p className="text-sm text-white/60">{t("forbidden")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-white/50">{t("desc")}</p>
      {(access === null || canStudents) && (
        <ImportCard academyId={academyId} kind="students" />
      )}
      {(access === null || canSchedule) && (
        <ImportCard academyId={academyId} kind="schedule" />
      )}
    </div>
  );
}
