"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  Button,
  ConfirmSheet,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError, type Academy } from "@/components/academy/shared";
import {
  VideoForm,
  type EditableVideo,
} from "@/components/academy/video-form";
import { useRouter } from "@/i18n/navigation";

type LoadState = "loading" | "ready" | "error" | "forbidden" | "notFound";

/**
 * /academia/videos/[id] - ficha del video (link externo): formulario de
 * edición precargado (PATCH /academies/:id/videos/:videoId) + zona
 * destructiva con delete. El detalle se resuelve con
 * GET /academies/:id/videos/:videoId. Solo owner/ADMIN (canAdminister):
 * para el resto la card del listado navega directo al link externo.
 */
export default function VideoDetailPage() {
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia/videos" backLabel={t.title} />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="videos">
            <Detail
              key={`${academy.id}:${params.id}`}
              academy={academy}
              videoId={params.id}
            />
          </AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}

function Detail({
  academy,
  videoId,
}: {
  academy: Academy;
  videoId: string;
}) {
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  const tc = useTranslations("common");
  const router = useRouter();

  const { me, loading: meLoading } = useMe();
  const [video, setVideo] = useState<EditableVideo | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/videos/${videoId}`,
      );
      if (!res.ok) {
        setState(
          res.status === 404
            ? "notFound"
            : res.status === 401 || res.status === 403
              ? "forbidden"
              : "error",
        );
        return;
      }
      setVideo((await res.json()) as EditableVideo);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id, videoId]);

  useEffect(() => {
    if (meLoading || !canAdminister) return;
    void load();
  }, [load, meLoading, canAdminister]);

  async function remove() {
    if (!video) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/videos/${video.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setConfirmDelete(false);
        showActionNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      showActionNotice({ text: t.deleted });
      router.push("/academia/videos");
    } catch {
      setConfirmDelete(false);
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (meLoading) {
    return <SkeletonList items={2} lines={1} />;
  }
  if (!canAdminister || state === "forbidden") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/60">{t.forbidden}</p>
        <Button href="/academia/videos" size="sm" variant="secondary">
          {tc("back")}
        </Button>
      </div>
    );
  }
  if (state === "loading") {
    return <SkeletonList items={2} lines={1} />;
  }
  if (state === "notFound") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/60">{t.notFound}</p>
        <Button href="/academia/videos" size="sm" variant="secondary">
          {tc("back")}
        </Button>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">{tc("error")}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!video) return <SkeletonList items={2} lines={1} />;

  return (
    <div className="flex flex-col gap-6">
      <VideoForm academy={academy} video={video} />

      {/* Zona destructiva al pie (console-patterns §4): div centrado
          separado por border-t, ghost rojo + ConfirmSheet. */}
      <div className="flex justify-center border-t border-line pt-6">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="text-red-400 hover:text-red-300"
        >
          {t.delete}
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        title={t.confirmDelete}
        confirmLabel={t.delete}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
