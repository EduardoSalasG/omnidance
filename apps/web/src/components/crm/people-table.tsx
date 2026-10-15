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
import type { CrmActor, CrmPeoplePage, CrmSegment, PeopleSort } from "./types";
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

  // Selección masiva (spec crm-campaign-ops): checkbox por fila + barra
  // de acciones en lote (tag add/remove, campaña a seleccionados).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Segmentos guardados del actor (spec crm-dynamic-segments) - llenan
  // el optgroup "guardados" del filtro de segmento (valor `seg:<id>`).
  const [savedSegments, setSavedSegments] = useState<CrmSegment[]>([]);

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
      if (seg.startsWith("seg:")) params.set("segmentId", seg.slice(4));
      else if (seg !== "ALL") params.set("segment", seg);
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
    setSelected(new Set());
    setBulkTag("");
    setSavedSegments([]);
    apiFetch(`/crm/segments?${actorQuery(actor)}`)
      .then(async (res) => {
        if (res.ok) setSavedSegments((await res.json()) as CrmSegment[]);
      })
      .catch(() => {});
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "Seleccionar página": marca/desmarca todas las rows visibles -
  // etiquetar de a una una página de 20 no es usable.
  const allPageSelected =
    rows !== null &&
    rows.length > 0 &&
    rows.every((r) => selected.has(r.personId));

  function selectPage() {
    if (!rows) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (rows.every((r) => next.has(r.personId))) {
        for (const r of rows) next.delete(r.personId);
      } else {
        for (const r of rows) next.add(r.personId);
      }
      return next;
    });
  }

  async function applyBulkTag(op: "add" | "remove") {
    const tag = bulkTag.trim();
    if (!tag || !selected.size || bulkBusy) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch("/crm/people/tags/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...actorBody(actor),
          personIds: [...selected],
          tag,
          op,
        }),
      });
      if (!res.ok) return setError(true);
      const { affected } = (await res.json()) as { affected: number };
      setNotice(t("people.bulkTagResult", { count: affected }));
      await load();
    } catch {
      setError(true);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          {t("people.total", { count: data?.total ?? 0 })}
        </p>
        <div className="flex items-center gap-2">
          {rows !== null && rows.length > 0 && (
            <Button size="sm" variant="ghost" onClick={selectPage}>
              {allPageSelected
                ? t("people.deselectPage")
                : t("people.selectPage")}
            </Button>
          )}
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
            {savedSegments.length > 0 && (
              <optgroup label={t("actorSegments.title")}>
                {savedSegments.map((s) => (
                  <option key={s.id} value={`seg:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
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

      {/* Barra de acciones masivas - aparece con selección activa */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-neon/40 bg-neon/5 p-3 sm:flex-row sm:items-center">
          <p className="text-sm font-semibold">
            {t("people.selectedCount", { count: selected.size })}
          </p>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              type="text"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder={t("people.bulkTagPlaceholder")}
              aria-label={t("people.bulkTagPlaceholder")}
              className={`${inputCls} max-w-48`}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkBusy || bulkTag.trim() === ""}
              onClick={() => void applyBulkTag("add")}
            >
              {t("people.bulkTagAdd")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy || bulkTag.trim() === ""}
              onClick={() => void applyBulkTag("remove")}
            >
              {t("people.bulkTagRemove")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              href={`/crm/campanas/nueva?personIds=${[...selected].join(",")}`}
            >
              {t("people.bulkCampaign")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              {t("people.clearSelection")}
            </Button>
          </div>
        </div>
      )}

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
              <li key={r.personId} className="flex items-start gap-1">
                {/* Checkbox de selección masiva - fuera del Link (patrón
                    de consola: sin interactivos anidados). El label
                    envolvente agranda el área táctil a 44px (el input
                    desnudo es 20px, bajo el mínimo WCAG 2.5.8). */}
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-start justify-center pt-4">
                  <input
                    type="checkbox"
                    checked={selected.has(r.personId)}
                    onChange={() => toggleSelect(r.personId)}
                    aria-label={t("people.selectRow", {
                      name: r.person?.name ?? r.personId,
                    })}
                    className="size-5 accent-neon"
                  />
                </label>
                {/* Card completo clickeable → ficha; la edición de tags
                    vive en /crm/personas/[id], no inline. */}
                <Link
                  href={`/crm/personas/${r.personId}`}
                  className="block min-w-0 flex-1 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
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
