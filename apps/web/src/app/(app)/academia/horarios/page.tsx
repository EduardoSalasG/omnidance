"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, ChevronRightIcon, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { SlotsSection } from "@/components/academy/slots-section";
import { ConsoleHeader } from "@/components/console/console-header";
import type { ClassSlot } from "@/components/academy/shared";

/**
 * /academia/horarios - parrilla semanal de la academia (ClassSlot). Solo
 * lectura: los horarios se crean/editan dentro de su serie en
 * /academia/series (invariante: todo slot pertenece a una serie).
 */
export default function AcademiaHorariosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SlotsModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function SlotsModule({ academyId }: { academyId: string }) {
  const tc = useTranslations("common");
  const ts = useTranslations("academySeries");
  const [slots, setSlots] = useState<ClassSlot[] | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/slots`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setSlots((await res.json()) as ClassSlot[]);
    } catch {
      setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (slots === null) {
    return <SkeletonList />;
  }
  return (
    <div className="flex flex-col gap-4">
      <SlotsSection slots={slots} />
      <Link
        href="/academia/series"
        className="inline-flex items-center gap-1 text-sm font-medium text-neon hover:underline"
      >
        {ts("title")} <ChevronRightIcon />
      </Link>
    </div>
  );
}
