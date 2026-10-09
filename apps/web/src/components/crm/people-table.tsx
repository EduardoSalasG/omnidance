"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Pager,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { TagBadges } from "./tag-badges";
import type { CrmActor, CrmPeoplePage, PeopleSort } from "./types";
import { PEOPLE_SORTS, SEGMENTS, actorBody, actorQuery } from "./types";

const PAGE_SIZE = 20;
const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm " +
  "text-ink focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

const SEGMENT_VARIANT: Record<string, "neon" | "outline" | "muted" | "live"> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "outline",
  CORE: "muted",
};

/**
 * Lista de personas del actor. GET /crm/people filtra (q/segment/tag) y
 * pagina en servidor (spec academy-console-v3); la respuesta trae
 * segmentCounts/allTags del universo completo para stats y opciones.
 * El input de búsqueda se debouncea 300ms.
 */
export function PeopleTable({ actor }: { actor: CrmActor }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [data, setData] = useState<CrmPeoplePage | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [seg, setSeg] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [sort, setSort] = useState<PeopleSort>("score_desc");
  const [page, setPage] = useState(1);

  const [recomputing, setRecomputing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Debounce del input de búsqueda - no golpear la API por tecla.
  useEffect(() => {
    const h = setTimeout(() => {
      setQApplied(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams(actorQuery(actor));
      if (qApplied) params.set("q", qApplied);
      if (seg !== "ALL") params.set("segment", seg);
      if (tag !== "ALL") params.set("tag", tag);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const res = await apiFetch(`/crm/people?${params}`);
      if (!res.ok) {
        setError(true);
        setData(null);
        return;
      }
      setData((await res.json()) as CrmPeoplePage);
    } catch {
      setError(true);
      setData(null);
    }
  }, [actor, qApplied, seg, tag, sort, page]);

  useEffect(() => {
    setData(null);
    setQ("");
    setQApplied("");
    setSeg("ALL");
    setTag("ALL");
    setSort("score_desc");
    setPage(1);
    setNotice(null);
  }, [actor]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.items ?? null;
  const segmentCounts = data?.segmentCounts ?? {};
  const allTags = data?.allTags ?? [];
  const hasFilters = qApplied !== "" || seg !== "ALL" || tag !== "ALL";

  async function recompute() {
    if (recomputing) return;
    setRecomputing(true);
    setNotice(null);
    try {
      const res = await apiFetch("/crm/scores/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorBody(actor)),
      });
      if (!res.ok) return setError(true);
      const { updated } = (await res.json()) as { updated: number };
      setNotice(t("people.recomputed", { count: updated }));
      await load();
    } catch {
      setError(true);
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          {t("people.total", { count: data?.total ?? 0 })}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={recomputing}
          onClick={() => void recompute()}
        >
          {recomputing ? (
            t("people.recomputing")
          ) : (
            <>
              <RefreshIcon /> {t("people.recompute")}
            </>
          )}
        </Button>
      </div>

      {/* Stats por segmento del universo completo (vienen en la respuesta) */}
      {rows !== null && Object.values(segmentCounts).some((c) => c > 0) && (
        <ul className="flex flex-wrap gap-2">
          {[...SEGMENTS, "NONE"].map((s) =>
            (segmentCounts[s] ?? 0) > 0 ? (
              <li key={s}>
                <Badge variant={SEGMENT_VARIANT[s] ?? "muted"}>
                  {t(`segments.${s}`)} · {segmentCounts[s]}
                </Badge>
              </li>
            ) : null,
          )}
        </ul>
      )}

      <div aria-live="polite">
        {notice && <p className="text-sm text-neon">{notice}</p>}
      </div>
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">{t("people.search")}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">
            {t("people.segmentFilter")}
          </span>
          <select
            value={seg}
            onChange={(e) => {
              setSeg(e.target.value);
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="ALL">{t("people.all")}</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {t(`segments.${s}`)}
              </option>
            ))}
            <option value="NONE">{t("segments.NONE")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">{t("people.tagFilter")}</span>
          <select
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="ALL">{t("people.all")}</option>
            {allTags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">{t("people.sort")}</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as PeopleSort);
              setPage(1);
            }}
            className={inputCls}
          >
            {PEOPLE_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`people.sorts.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lista - cards apiladas (mobile-first, estilo admin) */}
      {rows === null && !error && <SkeletonList items={4} lines={1} />}
      {rows !== null && rows.length === 0 && !hasFilters && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-ink/60">{t("people.empty")}</p>
          <Button
            size="sm"
            variant="secondary"
            disabled={recomputing}
            onClick={() => void recompute()}
          >
            {t("people.recompute")}
          </Button>
        </Card>
      )}
      {rows !== null && rows.length === 0 && hasFilters && (
        <p className="text-ink/60">{t("people.emptyFiltered")}</p>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          {rows.map((r) => {
            const segKey = r.segment ?? "NONE";
            return (
              <li key={r.personId}>
                {/* Card completo clickeable → ficha; la edición de tags
                    vive en /crm/personas/[id], no inline. */}
                <Link
                  href={`/crm/personas/${r.personId}`}
                  className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <Card className="flex flex-col gap-3 transition-colors hover:border-neon/60">
                    <div className="flex items-center gap-3">
                      {r.person?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.person.photoUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-sm font-bold text-ink/60"
                        >
                          {(r.person?.name ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {r.person?.name ?? r.personId.slice(0, 8)}
                        </p>
                        <p className="text-xs text-ink/50">
                          {r.computedAt
                            ? t("people.updatedAt", {
                                date: fmtDay.format(new Date(r.computedAt)),
                              })
                            : t("people.noScore")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold text-neon">
                          {r.score === null ? "-" : Math.round(r.score)}
                        </p>
                        <p className="text-xs text-ink/50">
                          {t("people.score")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEGMENT_VARIANT[segKey] ?? "muted"}>
                        {t(`segments.${segKey}`)}
                      </Badge>
                      <TagBadges tags={r.tags} />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {rows !== null && (data?.total ?? 0) > 0 && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          onPage={setPage}
        />
      )}
    </section>
  );
}
