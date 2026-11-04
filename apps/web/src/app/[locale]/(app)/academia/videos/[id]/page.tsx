"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  ArrowUpRightIcon,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError, type Academy } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";

type VideoDetail = {
  id: string;
  title: string;
  url?: string | null;
  classId?: string | null;
  restrictedToAttended?: boolean;
  createdAt?: string;
};

type LoadState = "loading" | "ready" | "error" | "forbidden" | "notFound";

// Cap de pageSize del contrato compartido (pageParams, max 100).
const SCAN_PAGE_SIZE = 100;

/**
 * /academia/videos/[id] - ficha del video (link externo): datos, "Ver
 * video" y zona destructiva. Solo owner/ADMIN (canAdminister): para el
 * resto la card del listado navega directo al link externo.
 *
 * No existe GET /videos/:videoId ni PATCH en el backend
 * (videos.controller.ts solo tiene POST, GET list y DELETE): la ficha
 * resuelve el video recorriendo el listado paginado - staff ve todos
 * los items con url. La edición queda pendiente de endpoint.
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
  const dayFmt = useDateFmt({
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  const tc = useTranslations("common");
  const router = useRouter();

  const { me, loading: meLoading } = useMe();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  const load = useCallback(async () => {
    setState("loading");
    try {
      // Sin GET por id: recorre el listado paginado hasta encontrarlo
      // (o agotar `total`). Staff recibe todos los videos con url.
      let found: VideoDetail | null = null;
      for (let page = 1; ; page += 1) {
        const res = await apiFetch(
          `/academies/${academy.id}/videos?page=${page}&pageSize=${SCAN_PAGE_SIZE}`,
        );
        if (!res.ok) {
          setState(
            res.status === 401 || res.status === 403 || res.status === 404
              ? "forbidden"
              : "error",
          );
          return;
        }
        const data = (await res.json()) as {
          items: VideoDetail[];
          total: number;
        };
        const hit = data.items.find((v) => v.id === videoId);
        if (hit) {
          found = hit;
          break;
        }
        if (
          data.items.length === 0 ||
          page * SCAN_PAGE_SIZE >= data.total
        ) {
          break;
        }
      }
      if (!found) {
        setState("notFound");
        return;
      }
      setVideo(found);
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
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{video.title}</h2>
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {video.classId && (
              <Badge variant="muted">{t.classBadge}</Badge>
            )}
            {video.restrictedToAttended && (
              <Badge variant="outline">{t.restricted}</Badge>
            )}
            <Badge variant="neon">{t.unlocked}</Badge>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink/50">{t.videoUrl}</dt>
              <dd>
                <a
                  href={video.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 font-semibold text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <ArrowUpRightIcon /> {t.watch}
                </a>
              </dd>
            </div>
            {video.classId && (
              <div>
                <dt className="text-xs text-ink/50">{t.classId}</dt>
                <dd className="font-medium">{video.classId}</dd>
              </div>
            )}
            {video.createdAt && (
              <div>
                <dt className="text-xs text-ink/50">{t.addedOn}</dt>
                <dd className="tabular-nums text-ink/70">
                  {dayFmt.format(new Date(video.createdAt))}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

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
