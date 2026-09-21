"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { inputCls, readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.videos;

type LoadState = "loading" | "ready" | "error";

/**
 * Video — espejo del schema (url externa, nunca self-host; sin `level`).
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

type Me = { id: string; roles: string[] };

const linkBtnCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl " +
  "border border-night-700 bg-night-900 px-4 text-sm font-semibold text-neon " +
  "transition-colors hover:border-neon/60 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon";

/**
 * Videos de la academia (links externos).
 * - Lista para cualquier usuario autenticado con contexto de academia;
 *   locked → metadatos + hint, unlocked → link "Ver video" externo.
 * - POST/DELETE exigen owner/ADMIN (requireAdminister): el form y el
 *   botón eliminar solo se renderizan con canAdminister (misma regla que
 *   canAdministerAcademy del dominio: ADMIN u ownerId === me.id).
 */
export function Videos({ academy }: { academy: Academy }) {
  const tc = useTranslations("common");

  const [me, setMe] = useState<Me | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [feedback, setFeedback] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [classId, setClassId] = useState("");
  const [restricted, setRestricted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  useEffect(() => {
    apiFetch("/me")
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : null))
      .then(setMe)
      .catch(() => {});
  }, []);

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

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          ...(classId.trim() ? { classId: classId.trim() } : {}),
          restrictedToAttended: restricted,
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setFeedback(t.added);
      setTitle("");
      setUrl("");
      setClassId("");
      setRestricted(true);
      await load();
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

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
      <h2 className="text-lg font-semibold">{t.title}</h2>

      {state === "loading" && <Spinner size="sm" className="page-loading" />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-white/60">{tc("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}
      {state === "ready" &&
        (videos.length === 0 ? (
          <p className="text-sm text-white/50">{t.empty}</p>
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
                          ↗ {t.watch}
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

      {canAdminister && (
        <Card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.addTitle}
          </h3>
          <form
            onSubmit={submit}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {t.videoTitle}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {t.videoUrl}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t.classId}</span>
              <input
                className={inputCls}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              />
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-night-700 bg-night-800 accent-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
              />
              <span className="text-xs text-white/70">
                {t.restrictedLabel}
              </span>
            </label>
            {formError && (
              <p role="alert" className="text-sm text-red-400 sm:col-span-2">
                {formError}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? tc("loading") : tc("create")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </section>
  );
}
