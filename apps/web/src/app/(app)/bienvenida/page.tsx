"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import { GenderGroup, type Gender } from "@/components/profile/GenderGroup";
import { inputCls } from "@/components/academy/shared";
import { isProfileStyleVisible } from "@/lib/profile-styles";

type DanceRole = "LEADER" | "FOLLOWER" | "SWITCH";
type StyleDraft = { role: DanceRole; level: string };
type StyleItem = { id: string; name: string; genre: string | null };

const DANCE_ROLES: DanceRole[] = ["LEADER", "FOLLOWER", "SWITCH"];
const DANCE_LEVELS = ["principiante", "intermedio", "avanzado"];
const GENDERS: Gender[] = ["M", "F", "OTHER"];

const chipCls = (active: boolean) =>
  `flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon active:scale-[0.98] motion-reduce:active:scale-100 ${
    active
      ? "border-neon bg-neon text-night-950"
      : "border-night-700 bg-night-800 text-white/70 hover:text-white"
  }`;

const selectCls =
  "min-h-11 min-w-0 rounded-lg border border-night-700 bg-night-900 px-3 text-sm text-white focus:border-neon focus:outline-none";

/**
 * Paso post-registro (spec post-signup-profile-setup): tras crear la
 * cuenta el login redirige acá. Todos los campos son opcionales y
 * "Ahora no" equivale a omitir - ambos marcan onboarding["profile-setup"]
 * para que la página no se interponga de nuevo (entrar directo con la
 * marca hecha redirige a ?next= o /inicio).
 */
function BienvenidaForm() {
  const t = useTranslations("welcome");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next");
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  const { me, loading: meLoading, refresh: refreshMe } = useMe();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [styles, setStyles] = useState<StyleItem[] | null>(null);
  const [picked, setPicked] = useState<Map<string, StyleDraft>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"generic" | "phoneTaken" | null>(null);
  const prefilled = useRef(false);

  function destino() {
    // Recarga completa: tras el save el /me del contexto queda viejo en
    // el siguiente árbol; un href fuerza estado fresco (mismo patrón
    // que el login).
    window.location.href = next ?? "/inicio";
  }

  async function markSeen() {
    try {
      await apiFetch("/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tour: "profile-setup" }),
      });
    } catch {
      // Best effort: si falla la marca, peor caso la página vuelve a
      // aparecer una vez - nunca bloquea.
    }
  }

  // Guard: sin sesión → login; con la marca → directo al destino.
  useEffect(() => {
    if (meLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (me.onboarding?.["profile-setup"]) {
      router.replace(next ?? "/inicio");
      return;
    }
    if (!prefilled.current) {
      prefilled.current = true;
      setName(me.name);
      setPhone(me.phone ?? "");
      setInstagram(me.instagram ?? "");
      setGender(me.gender ?? null);
    }
  }, [meLoading, me, next, router]);

  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) => {
        if (!res.ok) return;
        const all = (await res.json()) as StyleItem[];
        // El picker de perfil acota el catálogo (lib/profile-styles).
        setStyles(all.filter((s) => isProfileStyleVisible(s.name)));
      })
      .catch(() => {});
  }, []);

  function toggleStyle(styleId: string) {
    setPicked((prev) => {
      const nextMap = new Map(prev);
      if (nextMap.has(styleId)) nextMap.delete(styleId);
      else nextMap.set(styleId, { role: "LEADER", level: "" });
      return nextMap;
    });
  }

  function patchStyle(styleId: string, patch: Partial<StyleDraft>) {
    setPicked((prev) => {
      const nextMap = new Map(prev);
      const cur = nextMap.get(styleId);
      if (cur) nextMap.set(styleId, { ...cur, ...patch });
      return nextMap;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim() || me?.name,
        instagram: instagram.trim().replace(/^@+/, "") || null,
        gender,
      };
      const digits = phone.replace(/[\s()-]/g, "");
      if (digits) body.phone = digits;
      const res = await apiFetch("/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setError("phoneTaken");
        return;
      }
      if (!res.ok) {
        setError("generic");
        return;
      }
      if (picked.size > 0) {
        const srRes = await apiFetch("/me/style-roles", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: [...picked.entries()].map(([styleId, d]) => ({
              styleId,
              role: d.role,
              level: d.level || null,
            })),
          }),
        });
        if (!srRes.ok) {
          setError("generic");
          return;
        }
      }
      await markSeen();
      void refreshMe();
      destino();
    } catch {
      setError("generic");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    await markSeen();
    destino();
  }

  if (meLoading || !me || me.onboarding?.["profile-setup"]) {
    return <PageLoading />;
  }

  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-white/60">{t("subtitle")}</p>

      <Card className="mt-6 p-5">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/60">
              {t("name")}
            </span>
            <input
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/60">
              {t("phone")}
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              placeholder={t("phonePlaceholder")}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/60">
              {t("instagram")}
            </span>
            <input
              autoComplete="off"
              spellCheck={false}
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              disabled={saving}
              placeholder={t("instagramPlaceholder")}
              className={inputCls}
            />
          </label>

          <GenderGroup
            label={tp("datos.gender")}
            options={GENDERS.map((g) => ({
              value: g,
              label: tp(`datos.genderOptions.${g}`),
            }))}
            value={gender}
            onChange={setGender}
          />

          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-white/50">
              {t("danceTitle")}
            </span>
            <p className="mt-0.5 text-xs text-white/40">{t("danceHint")}</p>
            {styles === null ? (
              <p className="mt-3 text-xs text-white/40">{t("danceEmpty")}</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {styles.map((s) => {
                    const active = picked.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleStyle(s.id)}
                        disabled={saving}
                        className={chipCls(active)}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                {styles
                  .filter((s) => picked.has(s.id))
                  .map((s) => {
                    const d = picked.get(s.id)!;
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border border-night-700 bg-night-800/50 p-3"
                      >
                        <p className="text-sm font-medium">{s.name}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {DANCE_ROLES.map((r) => (
                            <button
                              key={r}
                              type="button"
                              aria-pressed={d.role === r}
                              onClick={() => patchStyle(s.id, { role: r })}
                              disabled={saving}
                              className={chipCls(d.role === r)}
                            >
                              {tp(`datos.danceRole.${r}`)}
                            </button>
                          ))}
                          <select
                            aria-label={`${s.name} · ${t("levelLabel")}`}
                            value={d.level}
                            onChange={(e) =>
                              patchStyle(s.id, { level: e.target.value })
                            }
                            disabled={saving}
                            className={selectCls}
                          >
                            <option value="">
                              {tp("datos.level.none")}
                            </option>
                            {DANCE_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {tp(`datos.level.${l}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error === "phoneTaken" ? t("phoneTaken") : t("saveError")}
            </p>
          )}

          <Button type="submit" disabled={saving} className="mt-1">
            {saving && <Spinner size="sm" />}
            {t("submit")}
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={() => void skip()}
        disabled={saving}
        className="mt-4 min-h-11 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline"
      >
        {t("skip")}
      </button>
    </main>
  );
}

// useSearchParams exige boundary Suspense en Next 14.
export default function BienvenidaPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BienvenidaForm />
    </Suspense>
  );
}
