"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, SkeletonList } from "@/components/ui";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { inputCls, readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.videos;

/**
 * Formulario de alta de video (link externo, nunca self-host) - vive en
 * la página dedicada /academia/videos/nuevo. POST /academies/:id/videos
 * exige owner/ADMIN (requireAdminister): el form solo se renderiza con
 * canAdminister (misma regla que canAdministerAcademy del dominio:
 * ADMIN u ownerId === me.id).
 */
export function VideoForm({ academy }: { academy: Academy }) {
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const { me, loading: meLoading } = useMe();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [classId, setClassId] = useState("");
  const [restricted, setRestricted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Éxito breve antes de volver al listado (que refetchea al montar).
  const [saved, setSaved] = useState(false);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
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
      setSaved(true);
      setTimeout(() => router.push("/academia/videos"), 1200);
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  if (meLoading) {
    return <SkeletonList items={2} lines={1} />;
  }
  if (!canAdminister) {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {ta("forbidden")}
      </p>
    );
  }

  return (
    <Card>
      {saved ? (
        <p role="status" className="text-sm text-neon">
          {t.added}
        </p>
      ) : (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t.addTitle}
          </h2>
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
            <label className="flex items-end gap-2 pb-1">
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
            {formError && (
              <p role="alert" className="text-sm text-red-400 sm:col-span-2">
                {formError}
              </p>
            )}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? tc("loading") : tc("create")}
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
        </>
      )}
    </Card>
  );
}
