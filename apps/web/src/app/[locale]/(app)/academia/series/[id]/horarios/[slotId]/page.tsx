"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  PageLoading,
  RefreshIcon,
  SkeletonCard,
  Spinner,
} from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { InstructorChecklist } from "@/components/academy/instructor-checklist";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";
import { getDateFmt } from "@/lib/intl";
import { safeInternalPath } from "@/lib/safe-next";

type LoadState =
  | "loading"
  | "ready"
  | "forbidden"
  | "notfound"
  | "error";

type Slot = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  // ISO medianoche UTC: presente en slots de taller o clase única
  // (spec workshop-one-off-class). Edita fecha en vez de weekday.
  oneOffDate?: string | null;
  instructors: { person: { id: string; name: string | null } }[];
  series: {
    id: string;
    name: string;
    instructors: { person: { id: string; name: string | null } }[];
  };
};

/**
 * /academia/series/[id]/horarios/[slotId] - ficha del horario: día/hora,
 * plantel asignado (limitado al roster habilitado de la serie) y zona
 * de peligro para eliminarlo (console-patterns).
 */
export default function SlotDetailPage({
  params,
}: {
  params: Promise<{ id: string; slotId: string }>;
}) {
  const { id: seriesId, slotId } = use(params);
  // useSearchParams (?from= del roster) exige boundary Suspense;
  // fallback mínimo: el header real monta dentro de SlotChrome.
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6">
      <Suspense fallback={<PageLoading />}>
        <SlotChrome seriesId={seriesId} slotId={slotId} />
      </Suspense>
    </main>
  );
}

function SlotChrome({
  seriesId,
  slotId,
}: {
  seriesId: string;
  slotId: string;
}) {
  const backFrom = safeInternalPath(useSearchParams().get("from"));
  const t = useTranslations("academySeries");
  return (
    <>
      {/* ConsoleHeader siempre montado (ficha canónica series/[id]):
          label canónico al listado; el detalle re-etiqueta cuando
          resuelve origen/entidad. */}
      <ConsoleHeader
        backHref={backFrom ?? `/academia/series/${seriesId}`}
        backLabel={t("title")}
      />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="classes">
            <SlotDetail
              key={`${academy.id}:${seriesId}`}
              academyId={academy.id}
              seriesId={seriesId}
              slotId={slotId}
            />
          </AcademyTierGate>
        )}
      </AcademyGate>
    </>
  );
}

function SlotDetail({
  academyId,
  seriesId,
  slotId,
}: {
  academyId: string;
  seriesId: string;
  slotId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [weekday, setWeekday] = useState(1);
  // "YYYY-MM-DD" del input[type=date]; solo se usa en slots de taller.
  const [date, setDate] = useState("");
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:00");
  const [instructors, setInstructors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Estados explícitos por respuesta (console-patterns §6): antes un
  // !res.ok silencioso dejaba el skeleton eterno en 403/404/5xx.
  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academyId}/slots/${slotId}`);
      if (res.status === 401 || res.status === 403) {
        setState("forbidden");
        return;
      }
      if (res.status === 404) {
        setState("notfound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const s = (await res.json()) as Slot;
      setSlot(s);
      setWeekday(s.weekday);
      // oneOffDate llega a medianoche UTC: el slice conserva el día
      // civil exacto (toDateInput usa zona local y lo correría un día
      // en UTC-3/-4).
      setDate(s.oneOffDate ? s.oneOffDate.slice(0, 10) : "");
      setStart(s.startTime);
      setEnd(s.endTime);
      setInstructors(s.instructors.map((i) => i.person.id));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId, slotId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = (slot?.series.instructors ?? []).map((i) => ({
    id: i.person.id,
    name: i.person.name,
  }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    // Slot de taller: el PATCH manda `date` (reprogramar corre la misma
    // cascada que cambiar weekday: cancela + reembolsa + materializa la
    // fecha nueva). Recurrente: weekday como siempre.
    const body = slot?.oneOffDate
      ? { date, startTime: start, endTime: end, instructorIds: instructors }
      : { weekday, startTime: start, endTime: end, instructorIds: instructors };
    try {
      const res = await apiFetch(`/academies/${academyId}/slots/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        showActionNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      // Vuelve a la ficha de la serie: aviso global que sobrevive el push.
      showActionNotice({ text: t("slotUpdated") });
      router.push(`/academia/series/${slot?.series.id}`);
    } catch {
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/academies/${academyId}/slots/${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        showActionNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        setConfirmDel(false);
        return;
      }
      showActionNotice({ text: t("slotDeleted") });
      router.push(`/academia/series/${slot?.series.id}`);
    } catch {
      showActionNotice({ text: tc("error"), error: true });
      setConfirmDel(false);
    } finally {
      setBusy(false);
    }
  }, [academyId, slotId, router, slot, t, tc]);

  if (state === "loading") return <SkeletonCard />;

  if (state === "forbidden" || state === "notfound") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink/60">
          {state === "forbidden" ? ta("forbidden") : t("slotNotFound")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          href={`/academia/series/${seriesId}`}
        >
          {tc("back")}
        </Button>
      </div>
    );
  }
  if (state === "error" || !slot) {
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

  // Identidad del horario en el headline: recurrente "martes · 19:30–
  // 20:30"; taller usa su fecha civil (la línea de edición muestra lo
  // mismo en los inputs - el header es la referencia estable).
  const slotLabel = slot.oneOffDate
    ? `${getDateFmt(locale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(slot.oneOffDate))} · ${slot.startTime}–${slot.endTime}`
    : `${ta(`weekday.${slot.weekday}`)} · ${slot.startTime}–${slot.endTime}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header de entidad desnudo (console-patterns §3): esta página
          ES la superficie de edición del horario - el header no navega
          a ningún lado, solo da identidad a la página (h2). */}
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="truncate text-lg font-semibold capitalize">
          {slotLabel}
        </h2>
        {slot.oneOffDate && (
          <Badge variant="muted">{t("workshopBadge")}</Badge>
        )}
      </div>
      <Card className="flex flex-col gap-4">
        {/* <form> real: `required` del input date valida nativo (antes
            el guard de !date era silencioso) y Enter envía. */}
        <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {slot.oneOffDate ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("dateLabel")}</span>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("weekdayLabel")}</span>
              <select className={inputCls} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>{ta(`weekday.${d}`)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("slotStart")}</span>
            <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("slotEnd")}</span>
            <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-ink/50">{t("slotInstructors")}</span>
          <InstructorChecklist label={t("slotInstructors")} options={roster} selected={instructors} onChange={setInstructors} disabled={busy} />
          {roster.length === 0 && (
            <p className="text-xs text-ink/40">{t("slotNoRoster")}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Spinner /> : tc("save")}
          </Button>
        </div>
        </form>
      </Card>
      {/* Zona roja canónica (console-patterns §4): eliminar horario
          (borrado lógico si hay clases pasadas; cancela las futuras y
          libera reservas - la cascada la describe el ConfirmSheet). */}
      <div className="flex justify-center border-t border-line pt-6">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-red-400 hover:text-red-300"
          onClick={() => setConfirmDel(true)}
        >
          {t("removeSlot")}
        </Button>
      </div>
      <ConfirmSheet
        open={confirmDel}
        title={t("removeSlot")}
        description={t("slotDeleteDesc")}
        confirmLabel={t("removeSlot")}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  );
}
