"use client";

import { useState } from "react";

import { useMessages, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { ArrowUpRightIcon, Button, Card, SkeletonList, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";

import { inputCls, readError, type Academy } from "./shared";
import { useRouter } from "@/i18n/navigation";



/** Video existente para modo edición (detalle de GET by-id). */
export type EditableVideo = {
  id: string;
  title: string;
  url?: string | null;
  classId?: string | null;
  restrictedToAttended?: boolean;
};

/**
 * Formulario de video (link externo, nunca self-host): alta en
 * /academia/videos/nuevo (POST) y edición en la ficha
 * /academia/videos/[id] (PATCH, precargado con `video`). Ambos
 * endpoints exigen owner/ADMIN (requireCapabilityWrite): el form solo
 * se renderiza con canAdminister (misma regla que
 * canAdministerAcademy del dominio: ADMIN u ownerId === me.id), por lo
 * que el detalle siempre llega completo (la máscara locked solo
 * aplica a viewers).
 */
export function VideoForm({
  academy,
  video,
}: {
  academy: Academy;
  video?: EditableVideo;
}) {
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const { me, loading: meLoading } = useMe();
  const [title, setTitle] = useState(video?.title ?? "");
  const [url, setUrl] = useState(video?.url ?? "");
  const [classId, setClassId] = useState(video?.classId ?? "");
  const [restricted, setRestricted] = useState(
    video?.restrictedToAttended ?? true,
  );
  const [busy, setBusy] = useState(false);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch(
        video
          ? `/academies/${academy.id}/videos/${video.id}`
          : `/academies/${academy.id}/videos`,
        {
          method: video ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            video
              ? {
                  title: title.trim(),
                  url: url.trim(),
                  // En edición el campo vacío desvincula (null); el
                  // create lo omite.
                  classId: classId.trim() ? classId.trim() : null,
                  restrictedToAttended: restricted,
                }
              : {
                  title: title.trim(),
                  url: url.trim(),
                  ...(classId.trim() ? { classId: classId.trim() } : {}),
                  restrictedToAttended: restricted,
                },
          ),
        },
      );
      if (!res.ok) {
        showActionNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      showActionNotice({ text: video ? t.saved : t.added });
      router.push("/academia/videos");
    } catch {
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (meLoading) {
    return <SkeletonList items={2} lines={1} />;
  }
  if (!canAdminister) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/60">
          {ta("forbidden")}
        </p>
        <Button href="/academia/videos" size="sm" variant="secondary">
          {tc("back")}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {video ? t.editTitle : t.addTitle}
        </h2>
        {video?.url && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            <ArrowUpRightIcon /> {t.watch}
          </a>
        )}
      </div>
      <form
        onSubmit={submit}
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">
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
          <span className="text-xs text-ink/50">
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
          <span className="text-xs text-ink/50">{t.classId}</span>
          <input
            className={inputCls}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-line bg-elevated accent-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            checked={restricted}
            onChange={(e) => setRestricted(e.target.checked)}
          />
          <span className="text-xs text-ink/70">
            {t.restrictedLabel}
          </span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {video ? tc("save") : tc("create")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => router.push("/academia/videos")}
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
