"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  ArrowUpRightIcon,
  Badge,
  Button,
  Card,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.videos;

type LoadState = "loading" | "ready" | "error";

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
  "border border-night-700 bg-night-900 px-4 text-sm font-semibold text-neon " +
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
  const [state, setState] = useState<LoadState>("loading");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academy.id}/videos`);
      if (!res.ok) {
        setState("error");
        return;
      }
      setVideos((await res.json()) as VideoItem[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id]);

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

      {state === "loading" && <SkeletonList items={2} lines={1} />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-white/60">{tc("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {state === "ready" &&
        (videos.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/50">{t.empty}</p>
            {canAdminister && (
              <Button href="/academia/videos/nuevo" size="sm">
                + {t.addTitle}
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {videos.map((v) => {
              const locked = v.locked === true || !v.url;
              return (
                <li key={v.id}>
                  <Card className="flex flex-col gap-3 p-4">
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
                      <p className="text-xs text-white/50">
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

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </section>
  );
}
