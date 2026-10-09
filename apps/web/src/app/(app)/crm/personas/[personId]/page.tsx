"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { TagBadges } from "@/components/crm/tag-badges";
import { ProPaywall } from "@/components/producer/pro-paywall";
import type {
  CrmActor,
  CrmPersonDetail,
  CrmTag,
} from "@/components/crm/types";
import { actorBody, actorQuery } from "@/components/crm/types";

const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm " +
  "text-ink focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const fmtDayTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const SEGMENT_VARIANT: Record<string, "neon" | "outline" | "muted" | "live"> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "outline",
  CORE: "muted",
};

// Ficha del contacto (spec crm-console-v1): score/segmento, tags
// editables, resumen de actividad y línea de tiempo reciente - todo
// dentro del universo del actor seleccionado.
export default function CrmPersonPage() {
  const t = useTranslations("crm");
  const { personId } = useParams<{ personId: string }>();
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/crm" backLabel={t("nav.people")} />
      <CrmNav active="people" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.proBlocked ? (
            <ProPaywall />
          ) : (
            <PersonDetail actor={ctx.actor} personId={personId} />
          )}
        </>
      )}
    </main>
  );
}

function PersonDetail({
  actor,
  personId,
}: {
  actor: CrmActor;
  personId: string;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [detail, setDetail] = useState<CrmPersonDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/crm/people/${personId}?${actorQuery(actor)}`,
      );
      if (res.status === 404) {
        setNotFound(true);
        setDetail(null);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setNotFound(false);
      setDetail((await res.json()) as CrmPersonDetail);
    } catch {
      setError(true);
    }
  }, [actor, personId]);

  useEffect(() => {
    setDetail(null);
    setNotFound(false);
    setError(false);
    void load();
  }, [load]);

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const value = tagDraft.trim();
    if (!value || tagSaving) return;
    setTagSaving(true);
    try {
      const res = await apiFetch("/crm/people/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...actorBody(actor), personId, tag: value }),
      });
      if (!res.ok) return setError(true);
      setTagDraft("");
      await load();
    } catch {
      setError(true);
    } finally {
      setTagSaving(false);
    }
  }

  async function deleteTag(tag: CrmTag) {
    if (tagDeleting) return;
    setTagDeleting(tag.id);
    try {
      const res = await apiFetch(`/crm/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) return setError(true);
      await load();
    } catch {
      setError(true);
    } finally {
      setTagDeleting(null);
    }
  }

  if (detail === null && !error && !notFound) {
    return <SkeletonCard lines={4} />;
  }

  if (notFound) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {t("personDetail.notFound")}
      </p>
    );
  }

  if (error || detail === null) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  const segKey = detail.segment ?? "NONE";

  return (
    <div className="flex flex-col gap-6">
      {/* Header del contacto */}
      <Card className="flex items-center gap-4">
        {detail.person?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.person.photoUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-lg font-bold text-ink/60"
          >
            {(detail.person?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">
            {detail.person?.name ?? detail.personId.slice(0, 8)}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={SEGMENT_VARIANT[segKey] ?? "muted"}>
              {t(`segments.${segKey}`)}
            </Badge>
            <span className="text-xs text-ink/50">
              {detail.computedAt
                ? t("people.updatedAt", {
                    date: fmtDay.format(new Date(detail.computedAt)),
                  })
                : t("people.noScore")}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-neon">
            {detail.score === null ? "-" : Math.round(detail.score)}
          </p>
          <p className="text-xs text-ink/50">{t("people.score")}</p>
        </div>
      </Card>

      {/* Resumen de actividad */}
      {detail.activity && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card className="flex flex-col gap-1">
            <dt className="text-xs text-ink/50">
              {t("personDetail.attendance")}
            </dt>
            <dd className="font-mono text-lg font-bold">
              {detail.activity.attendance}
            </dd>
          </Card>
          <Card className="flex flex-col gap-1">
            <dt className="text-xs text-ink/50">{t("personDetail.spend")}</dt>
            <dd className="font-mono text-lg font-bold">
              <PriceTag amount={detail.activity.spend} />
            </dd>
          </Card>
          <Card className="flex flex-col gap-1">
            <dt className="text-xs text-ink/50">
              {t("personDetail.referrals")}
            </dt>
            <dd className="font-mono text-lg font-bold">
              {detail.activity.referrals}
            </dd>
          </Card>
          <Card className="flex flex-col gap-1">
            <dt className="text-xs text-ink/50">
              {t("personDetail.firstAt")}
            </dt>
            <dd className="text-sm font-medium tabular-nums">
              {detail.activity.firstAt
                ? fmtDay.format(new Date(detail.activity.firstAt))
                : "-"}
            </dd>
          </Card>
          <Card className="flex flex-col gap-1">
            <dt className="text-xs text-ink/50">{t("personDetail.lastAt")}</dt>
            <dd className="text-sm font-medium tabular-nums">
              {detail.activity.lastAt
                ? fmtDay.format(new Date(detail.activity.lastAt))
                : "-"}
            </dd>
          </Card>
        </dl>
      )}

      {/* Tags - la edición vive acá (los cards del listado son solo
          lectura y navegan a esta ficha). */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("personDetail.tags")}
        </h3>
        {detail.tags.length === 0 && (
          <p className="text-sm text-ink/50">{t("personDetail.tagsEmpty")}</p>
        )}
        <TagBadges
          tags={detail.tags}
          onDelete={(tg) => void deleteTag(tg)}
          deleting={tagDeleting}
        />
        <form className="flex gap-2" onSubmit={(e) => void addTag(e)}>
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder={t("people.tagPlaceholder")}
            aria-label={t("people.addTag")}
            autoComplete="off"
            className={`${inputCls} flex-1`}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!tagDraft.trim() || tagSaving}
          >
            {t("people.addTag")}
          </Button>
        </form>
      </section>

      {/* Actividad reciente */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("personDetail.recent")}
        </h3>
        {detail.recent.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("personDetail.recentEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.recent.map((r, i) => (
              <li
                key={`${r.type}-${r.at}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
              >
                <Badge variant="outline" className="shrink-0">
                  {t(`personDetail.types.${r.type}`)}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.label || "—"}
                  {r.status ? ` · ${r.status}` : ""}
                  {r.amount != null ? (
                    <>
                      {" · "}
                      <PriceTag amount={r.amount} />
                    </>
                  ) : null}
                </span>
                <time
                  dateTime={r.at}
                  className="shrink-0 text-xs text-ink/50 tabular-nums"
                >
                  {fmtDayTime.format(new Date(r.at))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
