"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";

type Engagement = {
  events: number;
  avgAttendance: number;
  attendees: number;
  gender: { M: number; F: number; OTHER: number; undeclared: number };
  danceRoles: { leader: number; follower: number; declared: number };
  review: { avg: number | null; count: number };
  myReview: { score: number; comment: string | null } | null;
  canReview: boolean;
};

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Card de engagement de serie (spec series-engagement): stats
 * verificadas por check-in (asistencia, género, leader/follower) +
 * score agregado + formulario de review para asistentes. Los
 * comentarios escritos quedan privados del productor.
 */
export function SeriesEngagementCard({ seriesId }: { seriesId: string }) {
  const t = useTranslations("seriesEngagement");
  const tc = useTranslations("common");
  const [data, setData] = useState<Engagement | null>(null);
  const [error, setError] = useState(false);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/series/${seriesId}/engagement`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const d = (await res.json()) as Engagement;
      setData(d);
      if (d.myReview) setScore(d.myReview.score);
    } catch {
      setError(true);
    }
  }, [seriesId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!score || sending) return;
    setSending(true);
    try {
      const res = await apiFetch(`/events/series/${seriesId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          score,
          comment: comment.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSent(true);
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  if (error || !data) return null;

  const { gender, danceRoles } = data;
  const genderTotal = gender.M + gender.F + gender.OTHER;
  const leaderPct = pct(danceRoles.leader, danceRoles.declared);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
        {t("title")}
      </h2>

      {/* Stats verificadas por check-in */}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {data.avgAttendance > 0 && (
          <div>
            <dt className="text-xs text-ink/50">{t("avgAttendance")}</dt>
            <dd className="mt-0.5 font-semibold">{data.avgAttendance}</dd>
          </div>
        )}
        {genderTotal > 0 && (
          <div>
            <dt className="text-xs text-ink/50">{t("genderSplit")}</dt>
            <dd className="mt-0.5 font-semibold">
              {pct(gender.M, genderTotal)}% / {pct(gender.F, genderTotal)}%
            </dd>
          </div>
        )}
        {danceRoles.declared > 0 && (
          <div>
            <dt className="text-xs text-ink/50">{t("roleSplit")}</dt>
            <dd className="mt-0.5 font-semibold">
              {leaderPct}% / {100 - leaderPct}%
            </dd>
          </div>
        )}
        {data.review.count > 0 && data.review.avg != null && (
          <div>
            <dt className="text-xs text-ink/50">{t("score")}</dt>
            <dd className="mt-0.5 font-semibold text-neon">
              ★ {data.review.avg} · {data.review.count}
            </dd>
          </div>
        )}
      </dl>

      {/* Review propia - solo asistentes verificados (check-in) */}
      {data.canReview && (
        <div className="flex flex-col gap-3 border-t border-ink/10 pt-3">
          <p className="text-sm font-medium">
            {data.myReview ? t("yourReview") : t("rateCta")}
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                aria-label={`${n}`}
                className={`min-h-[44px] min-w-[44px] text-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                  n <= score ? "text-neon" : "text-ink/30 hover:text-ink/60"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t("commentPlaceholder")}
            className="w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2 text-sm focus:border-neon focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void submit()}
              disabled={!score || sending}
              className="self-start"
            >
              {sending ? <Spinner className="size-4" /> : t("submit")}
            </Button>
            {sent && (
              <span className="text-xs text-neon">{t("thanks")}</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
