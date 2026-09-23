"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useViewMode } from "@/lib/view-mode";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";

type DanceRole = "LEADER" | "FOLLOWER" | "SWITCH";

type StyleRole = {
  role: DanceRole;
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

// Borrador de una fila de "Tu baile" en modo edición. key es local
// (la unique real es personId+styleId+role); level "" = sin nivel.
type StyleRoleDraft = {
  key: number;
  styleId: string;
  role: DanceRole;
  level: string;
};

const DANCE_ROLES: DanceRole[] = ["LEADER", "FOLLOWER", "SWITCH"];
const DANCE_LEVELS = ["principiante", "intermedio", "avanzado"];

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

const selectCls =
  "min-h-11 min-w-0 rounded-lg border border-night-700 bg-night-900 px-3 text-sm text-white focus:border-neon focus:outline-none";

export default function DatosPage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const viewMode = useViewMode();

  const [state, setState] = useState<PageState>("loading");
  const [me, setMe] = useState<Me | null>(null);

  // Instagram: edición inline — tap enfoca el input, blur guarda si
  // hubo cambio (PATCH /me), Escape cancela.
  const [igEditing, setIgEditing] = useState(false);
  const [igInput, setIgInput] = useState("");
  const [igState, setIgState] = useState<"idle" | "saving" | "saved" | "err">(
    "idle",
  );
  const igCancel = useRef(false);

  // "Tu baile": modo edición con borrador local; Guardar hace
  // PUT /me/style-roles (reemplazo total).
  const [srEditing, setSrEditing] = useState(false);
  const [srDraft, setSrDraft] = useState<StyleRoleDraft[]>([]);
  const [stylesCat, setStylesCat] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [srSaving, setSrSaving] = useState(false);
  const [srErr, setSrErr] = useState(false);
  const keySeq = useRef(0);

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

  async function commitInstagram() {
    if (igCancel.current) {
      igCancel.current = false;
      setIgInput(me?.instagram ?? "");
      setIgEditing(false);
      return;
    }
    const clean = igInput.trim().replace(/^@+/, "");
    if (clean === (me?.instagram ?? "")) {
      setIgInput(clean);
      setIgEditing(false);
      return;
    }
    setIgState("saving");
    try {
      const res = await apiFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram: clean }),
      });
      if (!res.ok) {
        // El input queda visible para corregir y reintentar con blur.
        setIgState("err");
        return;
      }
      setMe((m) => (m ? { ...m, instagram: clean || null } : m));
      setIgInput(clean);
      setIgEditing(false);
      setIgState("saved");
      setTimeout(() => setIgState("idle"), 2500);
    } catch {
      setIgState("err");
    }
  }

  function startStyleRoleEdit() {
    if (!me) return;
    setSrDraft(
      me.styleRoles.map((sr) => ({
        key: keySeq.current++,
        styleId: sr.style.id,
        role: sr.role,
        level: sr.level ?? "",
      })),
    );
    setSrEditing(true);
    setSrErr(false);
    if (!stylesCat) {
      apiFetch("/styles")
        .then(async (res) => {
          if (res.ok) {
            setStylesCat((await res.json()) as { id: string; name: string }[]);
          }
        })
        .catch(() => {});
    }
  }

  function patchDraft(key: number, patch: Partial<StyleRoleDraft>) {
    setSrDraft((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  async function saveStyleRoles() {
    setSrSaving(true);
    setSrErr(false);
    try {
      const items = srDraft
        .filter((r) => r.styleId)
        .map((r) => ({
          styleId: r.styleId,
          role: r.role,
          level: r.level || null,
        }));
      const res = await apiFetch("/me/style-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        setSrErr(true);
        return;
      }
      const json = (await res.json()) as { styleRoles: StyleRole[] };
      setMe((m) => (m ? { ...m, styleRoles: json.styleRoles } : m));
      setSrEditing(false);
    } catch {
      setSrErr(true);
    } finally {
      setSrSaving(false);
    }
  }

  const levelLabel = (level: string | null) =>
    level
      ? DANCE_LEVELS.includes(level)
        ? t(`datos.level.${level}`)
        : level
      : null;

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
      <h1 className="text-2xl font-bold">{t("datos.title")}</h1>

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
          {/* Instagram editable: tap → input, blur → guarda si cambió */}
          <div className="flex items-baseline justify-between gap-4 py-1">
            <label
              htmlFor="ig-input"
              className="shrink-0 text-xs uppercase tracking-wide text-white/45"
            >
              {t("instagram")}
            </label>
            {igEditing ? (
              <input
                id="ig-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoFocus
                spellCheck={false}
                disabled={igState === "saving"}
                value={igInput}
                onChange={(e) => {
                  setIgInput(e.target.value);
                  setIgState("idle");
                }}
                onBlur={() => void commitInstagram()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    igCancel.current = true;
                    e.currentTarget.blur();
                  }
                }}
                placeholder={t("instagramPlaceholder")}
                className="min-w-0 max-w-52 flex-1 rounded-lg border border-neon/60 bg-night-900 px-2 py-1 text-right text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIgInput(me.instagram ?? "");
                  setIgEditing(true);
                }}
                className="-my-1 min-h-11 min-w-0 max-w-full truncate rounded-lg px-2 text-right text-sm text-white transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {me.instagram ? `@${me.instagram}` : t("datos.instagramEmpty")}
              </button>
            )}
          </div>
          <Field
            label={t("datos.memberSince")}
            value={dateFmt.format(new Date(me.createdAt))}
          />
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
        {me.verifiedAt && (
          <p className="pt-2 text-xs font-medium text-neon">
            ✓ {t("datos.verified")}
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
          {srEditing ? (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {srDraft.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/50 px-3 py-3"
                  >
                    <select
                      aria-label={t("datos.chooseStyle")}
                      value={r.styleId}
                      onChange={(e) =>
                        patchDraft(r.key, { styleId: e.target.value })
                      }
                      className={`${selectCls} w-full`}
                    >
                      <option value="">{t("datos.chooseStyle")}</option>
                      {(stylesCat ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={t("datos.chooseRole")}
                        value={r.role}
                        onChange={(e) =>
                          patchDraft(r.key, {
                            role: e.target.value as DanceRole,
                          })
                        }
                        className={`${selectCls} flex-1`}
                      >
                        {DANCE_ROLES.map((ro) => (
                          <option key={ro} value={ro}>
                            {t(`datos.danceRole.${ro}`)}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t("datos.level.none")}
                        value={r.level}
                        onChange={(e) =>
                          patchDraft(r.key, { level: e.target.value })
                        }
                        className={`${selectCls} flex-1`}
                      >
                        <option value="">{t("datos.level.none")}</option>
                        {DANCE_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {t(`datos.level.${l}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={t("datos.remove")}
                        onClick={() =>
                          setSrDraft((rows) =>
                            rows.filter((x) => x.key !== r.key),
                          )
                        }
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setSrDraft((rows) => [
                    ...rows,
                    {
                      key: keySeq.current++,
                      styleId: "",
                      role: "LEADER",
                      level: "",
                    },
                  ])
                }
                className="mt-3 inline-flex min-h-11 items-center rounded-full px-1 text-sm font-medium text-neon transition-colors hover:text-neon-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                + {t("datos.addStyle")}
              </button>
              {srErr && (
                <p role="alert" className="mt-2 text-xs text-red-400">
                  {t("datos.saveError")}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={srSaving}
                  onClick={() => setSrEditing(false)}
                >
                  {tc("cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={srSaving}
                  onClick={() => void saveStyleRoles()}
                >
                  {tc("save")}
                </Button>
              </div>
            </>
          ) : (
            <>
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
                        {levelLabel(sr.level) && (
                          <span className="text-white/50">
                            {" "}
                            · {levelLabel(sr.level)}
                          </span>
                        )}
                      </p>
                      <Badge variant="outline" className="shrink-0">
                        {t(`datos.danceRole.${sr.role}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={startStyleRoleEdit}
                className="mt-3 inline-flex min-h-11 items-center self-end rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {t("datos.edit")}
              </button>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
