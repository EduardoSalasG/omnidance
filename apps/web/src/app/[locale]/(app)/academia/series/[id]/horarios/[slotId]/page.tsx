"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, ConfirmSheet, SkeletonCard, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { InstructorChecklist } from "@/components/academy/instructor-checklist";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";

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
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <AcademyGate>
        {({ academy }) => (
          <SlotDetail
            key={`${academy.id}:${seriesId}`}
            academyId={academy.id}
            slotId={slotId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function SlotDetail({ academyId, slotId }: { academyId: string; slotId: string }) {
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [weekday, setWeekday] = useState(1);
  // "YYYY-MM-DD" del input[type=date]; solo se usa en slots de taller.
  const [date, setDate] = useState("");
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:00");
  const [instructors, setInstructors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    apiFetch(`/academies/${academyId}/slots/${slotId}`).then(async (res) => {
      if (!res.ok) return;
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
    });
  }, [academyId, slotId]);

  const roster = (slot?.series.instructors ?? []).map((i) => ({
    id: i.person.id,
    name: i.person.name,
  }));

  async function save() {
    if (busy) return;
    // El card no es <form>: required no valida solo, cortar fecha vacía.
    if (slot?.oneOffDate && !date) return;
    setBusy(true);
    setErr(null);
    // Slot de taller: el PATCH manda `date` (reprogramar corre la misma
    // cascada que cambiar weekday: cancela + reembolsa + materializa la
    // fecha nueva). Recurrente: weekday como siempre.
    const body = slot?.oneOffDate
      ? { date, startTime: start, endTime: end, instructorIds: instructors }
      : { weekday, startTime: start, endTime: end, instructorIds: instructors };
    const res = await apiFetch(`/academies/${academyId}/slots/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await readError(res)) ?? tc("error"));
      return;
    }
    // Vuelve a la ficha de la serie: aviso global que sobrevive el push.
    showActionNotice({ text: t("slotUpdated") });
    router.push(`/academia/series/${slot?.series.id}`);
  }

  const remove = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/slots/${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setErr((await readError(res)) ?? tc("error"));
        setConfirmDel(false);
        return;
      }
      showActionNotice({ text: t("slotDeleted") });
      router.push(`/academia/series/${slot?.series.id}`);
    } catch {
      setErr(tc("error"));
      setConfirmDel(false);
    } finally {
      setBusy(false);
    }
  }, [academyId, slotId, router, slot, t, tc]);

  if (!slot) return <SkeletonCard />;

  return (
    <div className="flex flex-col gap-6">
      <ConsoleHeader
        backHref={`/academia/series/${slot.series.id}`}
        backLabel={slot.series.name}
      />
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
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
          <InstructorChecklist options={roster} selected={instructors} onChange={setInstructors} disabled={busy} />
          {roster.length === 0 && (
            <p className="text-xs text-ink/40">{t("slotNoRoster")}</p>
          )}
        </div>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <Spinner /> : tc("save")}
          </Button>
        </div>
      </Card>
      {/* Zona de peligro: eliminar horario (borrado lógico si hay
          clases pasadas; cancela las futuras y libera reservas). */}
      <Card className="flex flex-col gap-3 border-red-500/30">
        <p className="text-xs text-ink/50">{t("slotDeleteDesc")}</p>
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDel(true)}>
            {t("removeSlot")}
          </Button>
        </div>
      </Card>
      <ConfirmSheet
        open={confirmDel}
        title={t("removeSlot")}
        description={t("slotDeleteDesc")}
        confirmLabel={t("removeSlot")}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  );
}
