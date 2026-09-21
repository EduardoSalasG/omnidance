"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { TagBadges } from "./tag-badges";
import type { CrmActor, CrmPersonRow, CrmTag } from "./types";
import { SEGMENTS, actorBody, actorQuery } from "./types";

const PAGE_SIZE = 20;
const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const inputCls =
  "min-h-11 w-full rounded-lg border border-night-700 bg-night-950 px-3 text-sm " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

const SEGMENT_VARIANT: Record<string, "neon" | "outline" | "muted" | "live"> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "outline",
  CORE: "muted",
};

/**
 * Lista de personas del actor. GET /crm/people devuelve el universo completo
 * (score + tags) sin filtros — búsqueda, segmento, tag y paginación son
 * client-side sobre ese array.
 */
export function PeopleTable({ actor }: { actor: CrmActor }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [rows, setRows] = useState<CrmPersonRow[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [page, setPage] = useState(1);

  const [recomputing, setRecomputing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tagOpenFor, setTagOpenFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagDeleting, setTagDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/people?${actorQuery(actor)}`);
      if (!res.ok) {
        setError(true);
        setRows([]);
        return;
      }
      setRows((await res.json()) as CrmPersonRow[]);
    } catch {
      setError(true);
      setRows([]);
    }
  }, [actor]);

  useEffect(() => {
    setRows(null);
    setQ("");
    setSeg("ALL");
    setTag("ALL");
    setPage(1);
    setNotice(null);
    void load();
  }, [load]);

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

  async function addTag(personId: string) {
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
      setTagOpenFor(null);
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

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) for (const tg of r.tags) set.add(tg.tag);
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const segmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const k = r.segment ?? "NONE";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (seg === "NONE" ? r.segment !== null : seg !== "ALL" && r.segment !== seg)
        return false;
      if (tag !== "ALL" && !r.tags.some((tg) => tg.tag === tag)) return false;
      if (
        needle &&
        !(r.person?.name ?? "").toLowerCase().includes(needle) &&
        !r.tags.some((tg) => tg.tag.toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
  }, [rows, q, seg, tag]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">
          {t("people.total", { count: rows?.length ?? 0 })}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={recomputing}
          onClick={() => void recompute()}
        >
          {recomputing ? t("people.recomputing") : `↻ ${t("people.recompute")}`}
        </Button>
      </div>

      {/* Stats por segmento (conteo client-side sobre la respuesta) */}
      {rows !== null && rows.length > 0 && (
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
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2 sm:col-span-1">
          <span className="text-sm text-white/70">{t("people.search")}</span>
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
          <span className="text-sm text-white/70">
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
          <span className="text-sm text-white/70">{t("people.tagFilter")}</span>
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
      </div>

      {/* Lista — cards apiladas (mobile-first, estilo admin) */}
      {rows === null && !error && <Spinner size="sm" />}
      {rows !== null && rows.length === 0 && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-white/60">{t("people.empty")}</p>
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
      {rows !== null && rows.length > 0 && filtered.length === 0 && (
        <p className="text-white/60">{t("people.emptyFiltered")}</p>
      )}

      {pageRows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pageRows.map((r) => {
            const segKey = r.segment ?? "NONE";
            return (
              <li key={r.personId}>
                <Card className="flex flex-col gap-3">
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
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-night-800 text-sm font-bold text-white/60"
                      >
                        {(r.person?.name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {r.person?.name ?? r.personId.slice(0, 8)}
                      </p>
                      <p className="text-xs text-white/50">
                        {r.computedAt
                          ? t("people.updatedAt", {
                              date: fmtDay.format(new Date(r.computedAt)),
                            })
                          : t("people.noScore")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xl font-bold text-neon">
                        {r.score === null ? "—" : Math.round(r.score)}
                      </p>
                      <p className="text-xs text-white/50">
                        {t("people.score")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SEGMENT_VARIANT[segKey] ?? "muted"}>
                      {t(`segments.${segKey}`)}
                    </Badge>
                    <TagBadges
                      tags={r.tags}
                      onDelete={(tg) => void deleteTag(tg)}
                      deleting={tagDeleting}
                    />
                    {tagOpenFor !== r.personId && (
                      <button
                        type="button"
                        onClick={() => {
                          setTagOpenFor(r.personId);
                          setTagDraft("");
                        }}
                        className="min-h-[32px] rounded-full border border-dashed border-white/20 px-3 text-xs text-white/60 hover:border-neon/60 hover:text-neon"
                      >
                        ＋ {t("people.addTag")}
                      </button>
                    )}
                  </div>

                  {tagOpenFor === r.personId && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addTag(r.personId);
                      }}
                    >
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
                        {tc("save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setTagOpenFor(null)}
                      >
                        {tc("cancel")}
                      </Button>
                    </form>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Paginación client-side (el endpoint devuelve el universo completo) */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("people.prev")}
          </Button>
          <p className="text-xs text-white/50">
            {t("people.page", { page: safePage, pages })}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={safePage >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            {t("people.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
