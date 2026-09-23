"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useViewMode } from "@/lib/view-mode";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";

type StyleRole = {
  role: "LEADER" | "FOLLOWER" | "SWITCH";
  level: string | null;
  style: { id: string; name: string; genre: string | null };
};

type EnrollmentRow = {
  status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
  startedAt: string;
  academy: { id: string; name: string };
  plan: { name: string } | null;
};

type Me = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  instagram: string | null;
  createdAt: string;
  verifiedAt: string | null;
  styleRoles: StyleRole[];
  enrollments: EnrollmentRow[];
};

type PageState = "loading" | "ready" | "unauth" | "error";

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const ENROLLMENT_VARIANT: Record<string, "neon" | "outline" | "muted"> = {
  ACTIVE: "neon",
  TRIAL: "outline",
  ONLINE: "outline",
  PAUSED: "muted",
  FROZEN: "muted",
};

// Fila label → valor dentro del card de datos personales.
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-xs uppercase tracking-wide text-white/45">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm">{value}</span>
    </div>
  );
}

export default function DatosPage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const viewMode = useViewMode();

  const [state, setState] = useState<PageState>("loading");
  const [me, setMe] = useState<Me | null>(null);
  // Edición del handle de Instagram (PATCH /me) — movida desde /perfil.
  const [igInput, setIgInput] = useState("");
  const [igDirty, setIgDirty] = useState(false);
  const [igState, setIgState] = useState<"idle" | "saving" | "saved" | "err">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setState("unauth");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const json = (await res.json()) as Me;
        setMe(json);
        setIgInput(json.instagram ?? "");
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveInstagram() {
    setIgState("saving");
    try {
      const res = await apiFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram: igInput }),
      });
      if (!res.ok) {
        setIgState("err");
        return;
      }
      const clean = igInput.trim().replace(/^@+/, "");
      setMe((m) => (m ? { ...m, instagram: clean || null } : m));
      setIgInput(clean);
      setIgDirty(false);
      setIgState("saved");
      setTimeout(() => setIgState("idle"), 2500);
    } catch {
      setIgState("err");
    }
  }

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (state === "loading" || state === "error" || !me) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        {state === "error" ? (
          <p role="alert" className="text-white/50">
            {tc("error")}
          </p>
        ) : (
          <PageLoading />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/perfil"
          className="inline-flex min-h-11 items-center gap-1 self-start rounded-full text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <span aria-hidden="true">←</span> {t("datos.back")}
        </Link>
        <h1 className="text-2xl font-bold">{t("datos.title")}</h1>
      </header>

      {/* Datos personales — comunes a ambos modos (social y academia) */}
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("datos.personal")}
        </h2>
        <div className="mt-2 flex flex-col divide-y divide-white/5">
          <Field label={t("datos.name")} value={me.name} />
          <Field label={t("datos.email")} value={me.email ?? "—"} />
          <Field
            label={t("datos.phone")}
            value={me.phone ?? t("datos.noPhone")}
          />
          <Field
            label={t("datos.memberSince")}
            value={dateFmt.format(new Date(me.createdAt))}
          />
          {me.verifiedAt && (
            <p className="pt-2 text-xs font-medium text-neon">
              ✓ {t("datos.verified")}
            </p>
          )}
        </div>
      </Card>

      {/* Instagram — handle público que ven tus amigos en tu perfil */}
      <Card>
        <h2
          id="ig-title"
          className="text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          {t("instagram")}
        </h2>
        <p className="mt-1 text-xs text-white/40">{t("instagramHint")}</p>
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="ig-input" className="sr-only">
            {t("instagram")}
          </label>
          <input
            id="ig-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={igInput}
            onChange={(e) => {
              setIgInput(e.target.value);
              setIgDirty(true);
              setIgState("idle");
            }}
            placeholder={t("instagramPlaceholder")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-night-700 bg-night-900 px-4 text-white placeholder:text-white/40 focus:border-neon focus:outline-none"
          />
          {igDirty && (
            <Button
              size="sm"
              disabled={igState === "saving"}
              onClick={() => void saveInstagram()}
            >
              {tc("save")}
            </Button>
          )}
        </div>
        {igState === "saved" && (
          <p role="status" className="mt-2 text-xs text-neon">
            {t("instagramSaved")}
          </p>
        )}
        {igState === "err" && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {t("instagramError")}
          </p>
        )}
      </Card>

      {/* Datos por modo — social: estilos con rol/nivel declarados;
          academia: inscripciones vigentes con plan y estado. */}
      {viewMode === "academy" ? (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("datos.academySection")}
          </h2>
          {me.enrollments.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">
              {t("datos.academyEmpty")}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {me.enrollments.map((e) => (
                <li
                  key={e.academy.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-800/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {e.academy.name}
                    </p>
                    <p className="text-xs text-white/50">
                      {e.plan ? `${t("datos.plan", { name: e.plan.name })} · ` : ""}
                      {t("datos.since", {
                        date: dateFmt.format(new Date(e.startedAt)),
                      })}
                    </p>
                  </div>
                  <Badge
                    variant={ENROLLMENT_VARIANT[e.status] ?? "muted"}
                    className="shrink-0"
                  >
                    {t(`datos.enrollmentStatus.${e.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("datos.socialSection")}
          </h2>
          {me.styleRoles.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">
              {t("datos.socialEmpty")}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {me.styleRoles.map((sr) => (
                <li
                  key={`${sr.style.id}-${sr.role}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-800/50 px-4 py-3"
                >
                  <p className="min-w-0 truncate text-sm font-medium">
                    {sr.style.name}
                    {sr.level && (
                      <span className="text-white/50"> · {sr.level}</span>
                    )}
                  </p>
                  <Badge variant="outline" className="shrink-0">
                    {t(`datos.danceRole.${sr.role}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </main>
  );
}
