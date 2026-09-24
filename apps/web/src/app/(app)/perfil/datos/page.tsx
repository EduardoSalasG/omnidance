"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useViewMode } from "@/lib/view-mode";
import { Badge, Button, Card, LevelBars } from "@/components/ui";
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
// Nivel autodeclarado → order de la escala de clases (Iniciación=0 …
// Avanzado=3) para pintarlo con las mismas barras que ClassCard.
const LEVEL_ORDER: Record<string, number> = {
  principiante: 0,
  intermedio: 2,
  avanzado: 3,
};

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

// Fila label → input en modo edición de datos personales (misma
// geometría que Field: label a la izquierda, input alineado a la
// derecha). Enter guarda, Escape cancela.
function EditField({
  id,
  label,
  value,
  onChange,
  onEnter,
  onEscape,
  ...inputProps
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  onEscape: () => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "onChange" | "onKeyDown"
>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <label
        htmlFor={id}
        className="shrink-0 text-xs uppercase tracking-wide text-white/45"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
          if (e.key === "Escape") onEscape();
        }}
        className="min-w-0 max-w-52 flex-1 rounded-lg border border-neon/60 bg-night-900 px-2 py-1 text-right text-sm text-white placeholder:text-white/40 focus:outline-none"
      />
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

  // Datos personales: modo edición — nombre, teléfono e Instagram son
  // editables (PATCH /me); email/fecha verificación son de solo lectura.
  const [personalEditing, setPersonalEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [igInput, setIgInput] = useState("");
  const [personalState, setPersonalState] = useState<
    "idle" | "saving" | "saved" | "err" | "nameRequired"
  >("idle");

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
        setNameInput(json.name);
        setPhoneInput(json.phone ?? "");
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

  function startPersonalEdit() {
    if (!me) return;
    setNameInput(me.name);
    setPhoneInput(me.phone ?? "");
    setIgInput(me.instagram ?? "");
    setPersonalState("idle");
    setPersonalEditing(true);
  }

  function cancelPersonalEdit() {
    setNameInput(me?.name ?? "");
    setPhoneInput(me?.phone ?? "");
    setIgInput(me?.instagram ?? "");
    setPersonalState("idle");
    setPersonalEditing(false);
  }

  async function savePersonal() {
    const name = nameInput.trim();
    if (name === "") {
      setPersonalState("nameRequired");
      return;
    }
    const ig = igInput.trim().replace(/^@+/, "");
    // Misma normalización del server: separadores fuera, "+" se conserva.
    const phone = phoneInput.replace(/[\s()-]/g, "");
    if (
      name === me?.name &&
      ig === (me?.instagram ?? "") &&
      phone === (me?.phone ?? "")
    ) {
      setPersonalEditing(false);
      return;
    }
    setPersonalState("saving");
    try {
      const res = await apiFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, instagram: ig }),
      });
      if (!res.ok) {
        setPersonalState("err");
        return;
      }
      setMe((m) =>
        m
          ? { ...m, name, instagram: ig || null, phone: phone || null }
          : m,
      );
      setPersonalEditing(false);
      setPersonalState("saved");
      setTimeout(() => setPersonalState("idle"), 2500);
    } catch {
      setPersonalState("err");
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">{t("datos.title")}</h1>

      {/* Datos personales — comunes a ambos modos (social y academia) */}
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("datos.personal")}
        </h2>
        <div className="mt-2 flex flex-col divide-y divide-white/5">
          {personalEditing ? (
            <>
              <EditField
                id="name-input"
                label={t("datos.name")}
                disabled={personalState === "saving"}
                value={nameInput}
                onChange={(v) => {
                  setNameInput(v);
                  setPersonalState("idle");
                }}
                onEnter={() => void savePersonal()}
                onEscape={cancelPersonalEdit}
                autoFocus
              />
              <EditField
                id="phone-input"
                label={t("datos.phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                disabled={personalState === "saving"}
                value={phoneInput}
                onChange={(v) => {
                  setPhoneInput(v);
                  setPersonalState("idle");
                }}
                onEnter={() => void savePersonal()}
                onEscape={cancelPersonalEdit}
                placeholder={t("datos.phonePlaceholder")}
              />
            </>
          ) : (
            <>
              <Field label={t("datos.name")} value={me.name} />
              <Field
                label={t("datos.phone")}
                value={me.phone ?? t("datos.noPhone")}
              />
            </>
          )}
          {/* Email no es editable (es la identidad de login) — siempre
              visible, también en modo edición. */}
          <Field label={t("datos.email")} value={me.email ?? "—"} />
          {personalEditing ? (
            <EditField
              id="ig-input"
              label={t("instagram")}
              autoComplete="off"
              spellCheck={false}
              disabled={personalState === "saving"}
              value={igInput}
              onChange={(v) => {
                setIgInput(v);
                setPersonalState("idle");
              }}
              onEnter={() => void savePersonal()}
              onEscape={cancelPersonalEdit}
              placeholder={t("instagramPlaceholder")}
            />
          ) : (
            <Field
              label={t("instagram")}
              value={
                me.instagram ? `@${me.instagram}` : t("datos.instagramEmpty")
              }
            />
          )}
          <Field
            label={t("datos.memberSince")}
            value={dateFmt.format(new Date(me.createdAt))}
          />
        </div>
        {personalState === "saved" && (
          <p role="status" className="mt-2 text-xs text-neon">
            {t("datos.saved")}
          </p>
        )}
        {personalState === "nameRequired" && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {t("datos.nameRequired")}
          </p>
        )}
        {personalState === "err" && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {t("datos.saveError")}
          </p>
        )}
        {me.verifiedAt && !personalEditing && (
          <p className="pt-2 text-xs font-medium text-neon">
            ✓ {t("datos.verified")}
          </p>
        )}
        {personalEditing ? (
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={personalState === "saving"}
              onClick={cancelPersonalEdit}
            >
              {tc("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={personalState === "saving"}
              onClick={() => void savePersonal()}
            >
              {tc("save")}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={startPersonalEdit}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {t("datos.edit")}
            </button>
          </div>
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
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        {sr.level &&
                          (LEVEL_ORDER[sr.level] !== undefined ? (
                            <LevelBars
                              order={LEVEL_ORDER[sr.level]}
                              name={levelLabel(sr.level) ?? ""}
                            />
                          ) : (
                            <span className="text-xs text-white/50">
                              {sr.level}
                            </span>
                          ))}
                        <Badge variant="outline">
                          {t(`datos.danceRole.${sr.role}`)}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={startStyleRoleEdit}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  {t("datos.edit")}
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
