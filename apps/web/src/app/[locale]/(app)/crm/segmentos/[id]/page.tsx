"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Badge, Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonCard, SkeletonList } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { SegmentForm } from "@/components/crm/segment-form";
import { rulesLabel } from "@/components/crm/segment-labels";
import { ProPaywall } from "@/components/producer/pro-paywall";
import type {
  CrmSegment,
  CrmSegmentPeople,
} from "@/components/crm/types";
import { Link, useRouter } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";

;

// Ficha de segmento guardado (spec crm-dynamic-segments): reglas,
// miembros materializados, edición en ficha y borrado en zona roja
// con confirmación bottom-sheet.
export default function CrmSegmentoPage() {
  const fmtDay = useDateFmt({
  dateStyle: "medium",
  timeStyle: "short",
});
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const ctx = useCrmContext();

  const [segment, setSegment] = useState<CrmSegment | null>(null);
  const [people, setPeople] = useState<CrmSegmentPeople | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteDialogRef = useDialogFocus<HTMLDivElement>(confirmDelete, () =>
    setConfirmDelete(false),
  );

  const load = useCallback(async () => {
    setError(false);
    try {
      const [segRes, peopleRes] = await Promise.all([
        apiFetch(`/crm/segments/${id}`),
        apiFetch(`/crm/segments/${id}/people`),
      ]);
      if (segRes.status === 404 || segRes.status === 403) {
        setNotFound(true);
        setSegment(null);
        return;
      }
      if (!segRes.ok || !peopleRes.ok) {
        setError(true);
        return;
      }
      setNotFound(false);
      setSegment((await segRes.json()) as CrmSegment);
      setPeople((await peopleRes.json()) as CrmSegmentPeople);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    setSegment(null);
    setPeople(null);
    setNotFound(false);
    if (ctx.actor) void load();
  }, [ctx.actor, load]);

  async function doDelete() {
    if (deleting || !segment) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/crm/segments/${segment.id}`, {
        method: "DELETE",
      });
      if (!res.ok) return setError(true);
      router.push("/crm/segmentos");
    } catch {
      setError(true);
    } finally {
      setDeleting(false);
    }
  }

  const s = segment;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/crm/segmentos"
        backLabel={t("actorSegments.title")}
      />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.proBlocked ? (
            <ProPaywall />
          ) : s === null && !error && !notFound ? (
            <SkeletonCard lines={4} />
          ) : notFound ? (
            <p role="alert" className="text-sm text-red-400">
              {t("actorSegments.notFound")}
            </p>
          ) : error || s === null ? (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          ) : editing ? (
            <SegmentForm
              actor={ctx.actor}
              editing={s}
              onSaved={() => {
                setEditing(false);
                void load();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  <Badge variant="neon">
                    {t("actorSegments.memberCount", { count: s.members })}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-ink/50">
                      {t("actorSegments.rules")}:
                    </dt>
                    <dd>{rulesLabel(t, s)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-ink/50">
                      {t("actorSegments.updatedAt")}:
                    </dt>
                    <dd className="tabular-nums">
                      {fmtDay.format(new Date(s.updatedAt))}
                    </dd>
                  </div>
                </dl>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                  >
                    {t("actorSegments.edit")}
                  </Button>
                </div>
              </Card>

              <section
                className="flex flex-col gap-3"
                aria-label={t("actorSegments.members")}
              >
                <h3 className="text-sm font-semibold">
                  {t("actorSegments.members")}
                </h3>
                {people === null ? (
                  <SkeletonList />
                ) : people.items.length === 0 ? (
                  <p className="text-sm text-ink/60">
                    {t("actorSegments.noMembers")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {people.items.map((m) => (
                      <li key={m.personId}>
                        {/* Miembro → ficha del contacto (mismo patrón
                            que las rows de /crm/personas). */}
                        <Link
                          href={`/crm/personas/${m.personId}`}
                          className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                        >
                          <Card className="flex items-center justify-between gap-3 py-3 transition-colors hover:border-neon/60">
                            <span className="font-medium">
                              {m.person?.name ?? m.personId}
                            </span>
                            <span className="text-xs tabular-nums text-ink/50">
                              {t("actorSegments.memberSince", {
                                date: fmtDay.format(new Date(m.since)),
                              })}
                            </span>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Zona destructiva al pie - div, no landmark (una
                  <section> sin nombre crea ruido en el árbol a11y). */}
              <div className="flex justify-center border-t border-line pt-6">
                <Button
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("actorSegments.delete")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {confirmDelete && s && (
        <div
          ref={deleteDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmDelete(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-segment-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-segment-title" className="text-lg font-semibold">
              {t("actorSegments.deleteTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              {t("actorSegments.deleteDesc")}
            </p>
            <p className="mt-3 text-sm font-medium">{s.name}</p>
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                className="flex-1 bg-red-500 hover:bg-red-400"
                disabled={deleting}
                onClick={() => void doDelete()}
              >
                {deleting ? tc("loading") : t("actorSegments.delete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
