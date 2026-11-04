"use client";

import { useCallback, useEffect, useState } from "react";
import { useMessages, useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  ArrowUpRightIcon,
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  Pager,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { Link } from "@/i18n/navigation";

import { filterQuery, type Academy } from "./shared";



// Los videos no son entidad del catálogo ACADEMY_OWNER: EntityDef local
// con la clave del contrato (spec analytics/query-console) - q sobre el
// título del video.
type AcademyExtras = (typeof import("@/i18n/parts/academyExtras.json"))["academyExtras"];

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
 *   (requireAdminister): con canAdminister (misma regla que
 *   canAdministerAcademy del dominio: ADMIN u ownerId === me.id) la
 *   card navega a la ficha /academia/videos/[id], donde viven el link
 *   externo y la zona destructiva. Sin canAdminister la card queda
 *   como hoy: link "Ver video" externo cuando está unlocked.
 */
export function Videos({ academy }: { academy: Academy }) {
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  const tc = useTranslations("common");
  const tq = useTranslations("query");

  const { me } = useMe();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>("loading");
  const [filters, setFilters] = useState<QueryFilters>({});

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);
  const hasFilters = filterQuery(filters) !== "";

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
          <p role="alert" className="text-sm text-ink/60">{tc("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {state === "ready" &&
        (videos.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/50">
              {hasFilters ? tq("empty") : t.empty}
            </p>
            {canAdminister && !hasFilters && (
              <Button
                href="/academia/videos/nuevo"
                size="sm"
                variant="secondary"
              >
                + {t.addTitle}
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => {
              const locked = v.locked === true || !v.url;
              // Anatomía ui-cards A: tag-row de clasificación,
              // headline identidad, hint de desbloqueo y acciones
              // ancladas al pie (mt-auto alinea la fila entre cards
              // de la grilla).
              const card = (
                <Card
                  className={
                    "flex h-full flex-col gap-3 p-4" +
                    (canAdminister
                      ? " transition-colors hover:border-neon/60"
                      : "")
                  }
                >
                  <div className="flex flex-wrap items-center gap-1.5">
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
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">
                      {v.title}
                    </p>
                    {/* Chevron al filo derecho del headline: affordance
                        permanente de "se toca" (mobile no tiene hover). */}
                    {canAdminister && (
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    )}
                  </div>
                  {locked && (
                    <p className="text-xs text-ink/50">{t.lockedHint}</p>
                  )}
                  {!canAdminister && !locked && (
                    <div className="mt-auto flex flex-wrap items-center gap-2">
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
                </Card>
              );
              return (
                <li key={v.id}>
                  {canAdminister ? (
                    <Link
                      href={`/academia/videos/${v.id}`}
                      className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                    >
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
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
    </section>
  );
}
