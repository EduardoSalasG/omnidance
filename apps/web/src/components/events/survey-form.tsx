"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import { StarRating } from "@/components/sessions/StarRating";

type Dim =
  | "music"
  | "occupation"
  | "organization"
  | "floorComfort"
  | "temperature"
  | "lightingSound";

// Dims siempre visibles (las dos que más leen DJ/productor); el resto va
// tras "Evaluar más" — progressive disclosure, misma idea que
// instructors-section (pocas visibles, resto colapsado).
const PRIMARY_DIMS: Dim[] = ["music", "occupation"];
const EXTRA_DIMS: Dim[] = [
  "organization",
  "floorComfort",
  "temperature",
  "lightingSound",
];

type Phase =
  | "form"
  | "submitting"
  | "done"
  | "expired"
  | "forbidden"
  | "unauth"
  | "error";

function DimRow({
  dim,
  value,
  busy,
  onSelect,
}: {
  dim: Dim;
  value: number | null;
  busy: boolean;
  onSelect: (v: number) => void;
}) {
  const t = useTranslations("survey");
  return (
    <li>
      <span className="block text-sm font-medium text-white/80">
        {t(`dims.${dim}`)}
      </span>
      <StarRating
        value={value}
        busy={busy}
        onSelect={onSelect}
        ariaLabel={t(`dims.${dim}`)}
      />
      {/* Extremos bipolares: texto de los polos 1 y 5 — el promedio lo
          interpreta la analítica, la escala vive solo en UI. */}
      <span className="flex justify-between text-xs text-white/50">
        <span>{t(`scale.${dim}.low`)}</span>
        <span>{t(`scale.${dim}.high`)}</span>
      </span>
    </li>
  );
}

/**
 * Encuesta post-evento (/eventos/[id]/evaluar). `overall` es obligatorio
 * en UI (en API es una dim opcional más); las demás son opcionales.
 * Re-enviar edita la evaluación previa (upsert server-side). Errores:
 * 409 ventana cerrada → expired; 403 sin check-in → forbidden; 401 →
 * unauth con CTA de login.
 */
export function SurveyForm({
  eventId,
  eventName,
}: {
  eventId: string;
  /** null si el fetch SSR del evento falló — el título cae al genérico. */
  eventName: string | null;
}) {
  const t = useTranslations("survey");
  const tc = useTranslations("common");
  const router = useRouter();
  const title = eventName ? t("title", { name: eventName }) : t("fallbackTitle");

  const [overall, setOverall] = useState<number | null>(null);
  const [dims, setDims] = useState<Partial<Record<Dim, number>>>({});
  const [more, setMore] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [showRequired, setShowRequired] = useState(false);
  const busy = phase === "submitting";

  async function submit() {
    if (overall == null) {
      setShowRequired(true);
      return;
    }
    setPhase("submitting");
    const body: Record<string, number> = { overall };
    for (const dim of [...PRIMARY_DIMS, ...EXTRA_DIMS]) {
      const v = dims[dim];
      if (v != null) body[dim] = v;
    }
    try {
      const res = await apiFetch(`/events/${eventId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setPhase("done");
        return;
      }
      if (res.status === 409) setPhase("expired");
      else if (res.status === 403) setPhase("forbidden");
      else if (res.status === 401) setPhase("unauth");
      else setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  // Éxito → confirmación breve y de vuelta al inicio (el feedback es
  // una acción pedida, no una carga: mensaje inline + redirect).
  useEffect(() => {
    if (phase !== "done") return;
    const id = setTimeout(() => router.push("/inicio"), 1400);
    return () => clearTimeout(id);
  }, [phase, router]);

  let content: React.ReactNode;
  if (phase === "done") {
    content = (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p role="status" className="text-base font-semibold text-neon">
          {t("thanks")}
        </p>
      </Card>
    );
  } else if (phase === "expired" || phase === "forbidden") {
    content = (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <p role="alert" className="text-sm text-white/70">
          {phase === "expired" ? t("expired") : t("forbidden")}
        </p>
        <Button href={`/eventos/${eventId}`} variant="secondary" size="sm">
          {t("backToEvent")}
        </Button>
      </Card>
    );
  } else if (phase === "unauth") {
    content = (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <Button href="/login" size="lg" className="w-full">
          {tc("login")}
        </Button>
      </Card>
    );
  } else {
    content = (
      <>
      <Card className="flex flex-col gap-4">
        {/* Overall — obligatorio. Estrella sin selección bloquea el
            envío con un aviso, no con el botón deshabilitado (el
            usuario ve QUÉ falta). */}
        <div>
          <span className="block text-sm font-semibold">
            {t("overall")}
          </span>
          <StarRating
            value={overall}
            busy={busy}
            required
            invalid={showRequired}
            ariaDescribedBy={showRequired ? "overall-required" : undefined}
            ariaLabel={t("overall")}
            onSelect={(v) => {
              setOverall(v);
              setShowRequired(false);
            }}
          />
          {showRequired && (
            <p
              id="overall-required"
              role="alert"
              className="mt-1 text-xs text-amber-300"
            >
              {t("overallRequired")}
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-4">
          {PRIMARY_DIMS.map((dim) => (
            <DimRow
              key={dim}
              dim={dim}
              value={dims[dim] ?? null}
              busy={busy}
              onSelect={(v) => setDims((d) => ({ ...d, [dim]: v }))}
            />
          ))}
          {more &&
            EXTRA_DIMS.map((dim) => (
              <DimRow
                key={dim}
                dim={dim}
                value={dims[dim] ?? null}
                busy={busy}
                onSelect={(v) => setDims((d) => ({ ...d, [dim]: v }))}
              />
            ))}
        </ul>

        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {more ? t("less") : t("more")}
          </Button>
        </div>
      </Card>

      <div aria-live="polite">
        {phase === "error" && (
          <p role="alert" className="text-sm text-red-400">
            {t("error")}
          </p>
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy && <Spinner size="sm" />}
        {t("submit")}
      </Button>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-1 pt-4">
        <h2 className="text-xl font-bold">{title}</h2>
        {(phase === "form" ||
          phase === "submitting" ||
          phase === "error") && (
          <p className="text-sm text-white/50">{t("subtitle")}</p>
        )}
      </header>
      {content}
    </main>
  );
}
