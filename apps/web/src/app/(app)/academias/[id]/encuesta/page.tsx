"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, Spinner } from "@/components/ui";
import { StarRating } from "@/components/sessions/StarRating";

type Phase = "form" | "submitting" | "done" | "forbidden" | "error";

// Mes "YYYY-MM" → "octubre 2026" (bordes en UTC para no correr el mes).
const monthFmt = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
};

/**
 * /academias/[id]/encuesta?seriesId=&month=&series= - encuesta mensual
 * del alumno (spec academy-console-v3): rating del curso + del profe +
 * observaciones opcional. Elegibilidad real la valida el server
 * (POST /me/course-surveys exige ≥1 asistencia ese mes) - acá solo se
 * pinta el form si los params vienen completos.
 */
function EncuestaInner({ academyId }: { academyId: string }) {
  const t = useTranslations("courseSurvey");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const { me, loading } = useMe();

  const seriesId = params.get("seriesId") ?? "";
  const month = params.get("month") ?? "";
  const seriesName = params.get("series") ?? "";

  const [course, setCourse] = useState<number | null>(null);
  const [instructor, setInstructor] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [missing, setMissing] = useState(false);

  const valid = /^\d{4}-\d{2}$/.test(month) && seriesId !== "";

  async function submit() {
    if (!course) {
      setMissing(true);
      return;
    }
    setPhase("submitting");
    try {
      const res = await apiFetch("/me/course-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId,
          month,
          courseRating: course,
          instructorRating: instructor,
          comment: comment.trim() || null,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  if (loading) return null;
  if (!me) {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("loginRequired")}</p>
        <Button href="/login" size="sm">
          {tc("login")}
        </Button>
      </Card>
    );
  }
  if (!valid) {
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-ink/70">{t("invalid")}</p>
      </Card>
    );
  }
  if (phase === "done") {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-base font-semibold text-neon">{t("thanks")}</p>
        <Button variant="secondary" size="sm" onClick={() => router.back()}>
          {tc("back")}
        </Button>
      </Card>
    );
  }
  if (phase === "forbidden") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
        <Button href="/inicio" variant="secondary" size="sm">
          {tc("appName")}
        </Button>
      </Card>
    );
  }

  const busy = phase === "submitting";

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold">
          {t("title", { name: seriesName || "tu curso" })}
        </h2>
        <p className="mt-0.5 text-sm text-ink/60">
          {monthLabel(month)} · {t("subtitle")}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-ink/80">{t("course")}</p>
        <StarRating
          value={course}
          busy={busy}
          onSelect={(v) => {
            setCourse(v);
            setMissing(false);
          }}
          ariaLabel={t("course")}
          required
          invalid={missing}
        />
        {missing && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {t("courseRequired")}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-ink/80">{t("instructor")}</p>
        <StarRating
          value={instructor}
          busy={busy}
          onSelect={setInstructor}
          ariaLabel={t("instructor")}
        />
      </div>

      <div>
        <label
          htmlFor="survey-comment"
          className="block text-sm font-medium text-ink/80"
        >
          {t("comment")}
        </label>
        <textarea
          id="survey-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy}
          maxLength={500}
          rows={3}
          placeholder={t("commentPlaceholder")}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-neon focus:outline-none"
        />
      </div>

      {phase === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {t("error")}
        </p>
      )}

      <Button onClick={() => void submit()} disabled={busy}>
        {busy ? <Spinner size="sm" /> : null}
        {t("submit")}
      </Button>

      <Link
        href={`/academias/${academyId}`}
        className="self-center text-sm text-ink/50 underline-offset-2 hover:text-ink hover:underline"
      >
        {t("backToAcademy")}
      </Link>
    </Card>
  );
}

export default function EncuestaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={null}>
        <EncuestaInner academyId={id} />
      </Suspense>
    </main>
  );
}
