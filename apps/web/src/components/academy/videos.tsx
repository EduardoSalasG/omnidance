"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  ArrowUpRightIcon,
  Badge,
  Button,
  Card,
  Pager,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { filterQuery, readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.videos;

// Los videos no son entidad del catálogo ACADEMY_OWNER: EntityDef local
// con la clave del contrato (spec analytics/query-console) - q sobre el
// título del video.
const VIDEOS_ENTITY: EntityDef = {
  entity: "academy_videos",
  filters: [{ key: "q", type: "text" }],
  columns: [],
};

type LoadState = "loading" | "ready" | "error";

const PAGE_SIZE = 24;

/**
 * Video - espejo del schema (url externa, nunca self-host; sin `level`).
 * GET /academies/:id/videos: staff y videos no restringidos vienen con url;
 * restringidos sin acceso vienen {id, title, classId, restrictedToAttended,
 * locked:true} SIN url. Desbloqueo server-side: asistencia a la Class
 * asociada o enrollment ACTIVE.
 */
type VideoItem = {
  id: string;
  title: string;
  url?: string | null;
  classId?: string | null;
  restrictedToAttended?: boolean;
  locked?: boolean;
};


const linkBtnCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl " +
  "border border-line bg-surface px-4 text-sm font-semibold text-neon " +
  "transition-colors hover:border-neon/60 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon";

/**
 * Videos de la academia (links externos) - solo listado.
 * - Lista para cualquier usuario autenticado con contexto de academia;
 *   locked → metadatos + hint, unlocked → link "Ver video" externo.
 * - Crear vive en /academia/videos/nuevo y DELETE exige owner/ADMIN
 *   (requireAdminister): el CTA y el botón eliminar solo se renderizan
 *   con canAdminister (misma regla que canAdministerAcademy del dominio:
 *   ADMIN u ownerId === me.id).
 */
export function Videos({ academy }: { academy: Academy }) {
  const tc = useTranslations("common");

  const { me } = useMe();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>("loading");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academy.id}/videos${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as {
        items: VideoItem[];
        total: number;
      };
      setVideos(data.items);
      setTotal(data.total);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(v: VideoItem): Promise<void> {
    if (!window.confirm(t.confirmDelete)) return;
    setBusyId(v.id);
    setFeedback(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/videos/${v.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setFeedback((await readError(res)) ?? tc("error"));
        return;
      }
      setFeedback(t.deleted);
      await load();
    } catch {
      setFeedback(tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label={t.title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        {canAdminister && (
          <Button href="/academia/videos/nuevo" size="sm">
            + {t.addTitle}
          </Button>
        )}
      </div>

      <FilterBar
        entity={VIDEOS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{}}
      />

      {state === "loading" && <SkeletonList items={2} lines={1} />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink/60">{tc("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {state === "ready" &&
        (videos.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/50">{t.empty}</p>
            {canAdminister && (
              <Button href="/academia/videos/nuevo" size="sm">
                + {t.addTitle}
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => {
              const locked = v.locked === true || !v.url;
              return (
                <li key={v.id}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="min-w-0 flex-1 truncate font-medium">
                        {v.title}
                      </p>
                      {v.classId && (
                        <Badge variant="muted">{t.classBadge}</Badge>
                      )}
                      {v.restrictedToAttended && (
                        <Badge variant="outline">{t.restricted}</Badge>
                      )}
                      <Badge variant={locked ? "muted" : "neon"}>
                        {locked ? t.locked : t.unlocked}
                      </Badge>
                    </div>
                    {locked ? (
                      <p className="text-xs text-ink/50">
                        {t.lockedHint}
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={v.url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkBtnCls}
                        >
                          <ArrowUpRightIcon /> {t.watch}
                        </a>
                      </div>
                    )}
                    {canAdminister && (
                      <div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400/80 hover:text-red-400"
                          disabled={busyId === v.id}
                          onClick={() => void remove(v)}
                        >
                          {t.delete}
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
      {state === "ready" && videos.length > 0 && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </section>
  );
}
