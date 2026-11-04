"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ImportCard } from "@/components/academy/import-section";
import type { AcademyCap } from "@/components/academy/use-academy-access";

/**
 * /academia/configuracion/importar - cargas masivas CSV de la academia.
 * Agrupa las importaciones one-shot (alumnos, clases) que antes vivían
 * embebidas en /academia/alumnos y /academia/series: son setup de una
 * vez, no operación diaria - por eso van en Configuración.
 * Cada card se muestra solo si el viewer tiene el cap correspondiente
 * (students/schedule) - el backend gatea igual en /import/:kind.
 */
export default function ConfigImportarPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <AcademyGate>
        {({ academy }) => (
          <ImportSection key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

type AccessInfo = { caps: Partial<Record<AcademyCap, boolean>> };
type Phase = "loading" | "ready" | "forbidden" | "error";

function ImportSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyImport");
  const tc = useTranslations("common");
  const [phase, setPhase] = useState<Phase>("loading");
  const [access, setAccess] = useState<AccessInfo | null>(null);

  // GET /academies/:id/access directo (no useAcademyAccess): el hook
  // devuelve null tanto mientras carga como si la llamada falla; esta
  // página necesita distinguir error (retry) de "sin caps" (forbidden).
  const load = useCallback(async () => {
    setPhase("loading");
    const res = await apiFetch(`/academies/${academyId}/access`).catch(
      () => null,
    );
    if (!res) {
      setPhase("error");
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setPhase("forbidden");
      return;
    }
    if (!res.ok) {
      setPhase("error");
      return;
    }
    setAccess((await res.json()) as AccessInfo);
    setPhase("ready");
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "loading") {
    return <SkeletonList items={2} lines={2} />;
  }
  if (phase === "error") {
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

  const canStudents = access?.caps.students === true;
  const canSchedule = access?.caps.schedule === true;

  // Staff sin caps de importación: estado "sin acceso" explícito con
  // salida al hub; nunca página vacía (el backend gatea igual en
  // /import/:kind).
  if (phase === "forbidden" || (!canStudents && !canSchedule)) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
        <Button variant="secondary" href="/academia">
          {tc("back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink/60">{t("desc")}</p>
      {canStudents && <ImportCard academyId={academyId} kind="students" />}
      {canSchedule && <ImportCard academyId={academyId} kind="schedule" />}
    </div>
  );
}
