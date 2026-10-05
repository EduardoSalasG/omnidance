"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, RefreshIcon } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type { ActorType, CrmActor } from "./types";
import { actorKey } from "./types";

// Roles con permiso crm.manage (seed-common ROLE_GRANTS) — ADMIN pasa por
// isSuperuser. Espejo client-side del RolesGuard; el backend valida igual.
const CRM_ROLES = new Set(["PRODUCER", "ACADEMY_OWNER", "ADMIN"]);

export type CrmGate = "loading" | "unauth" | "forbidden" | "error" | "ready";

export type CrmContextValue = {
  gate: CrmGate;
  boot: () => Promise<void>;
  actors: CrmActor[];
  actor: CrmActor | null;
  actorSel: string;
  setActorSel: (v: string) => void;
  isAdmin: boolean;
  /** El actor seleccionado es el propio CRM del productor y no tiene
      Pro efectivo — espejo del gateo del API (assertActorAccess →
      assertProducerPro solo cuando actorId === caller.id). Las
      páginas renderizan el paywall en vez del contenido. */
  proBlocked: boolean;
  manualType: ActorType;
  setManualType: (v: ActorType) => void;
  manualId: string;
  setManualId: (v: string) => void;
  applyManual: () => void;
};

/**
 * Resuelve el actor CRM del usuario:
 * - PRODUCER → su propio CRM (actorId = personId).
 * - ACADEMY_OWNER → academias donde es owner (GET /academies/mine filtrado;
 *   assertActorAccess solo acepta ownerId, no instructores).
 * - ADMIN → además puede cargar cualquier actor a mano ("manual").
 */
export function useCrmContext(): CrmContextValue {
  const t = useTranslations("crm");

  // /me compartido (MeProvider) — sin fetch propio de sesión. Las
  // academias del owner se piden en paralelo (especulativo mientras /me
  // sigue en vuelo; si el usuario no resulta owner se descartan).
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const meId = me?.id ?? "";
  const isAdmin = me?.roles.includes("ADMIN") ?? false;
  const effectivePro = me?.effectivePro ?? null;

  const [myAcademies, setMyAcademies] = useState<
    { id: string; name: string; ownerId: string }[] | null
  >(null);
  const [academiesError, setAcademiesError] = useState(false);
  const [academiesNonce, setAcademiesNonce] = useState(0);
  const needsAcademies = me?.roles.includes("ACADEMY_OWNER") ?? false;

  useEffect(() => {
    if ((!meLoading && !me) || (me && !needsAcademies)) return;
    let cancelled = false;
    apiFetch("/academies/mine")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setAcademiesError(true);
          return;
        }
        setAcademiesError(false);
        setMyAcademies(
          (await res.json()) as { id: string; name: string; ownerId: string }[],
        );
      })
      .catch(() => {
        if (!cancelled) setAcademiesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meLoading, me, needsAcademies, academiesNonce]);

  const sessionGate: CrmGate | null = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => CRM_ROLES.has(r))
          ? "forbidden"
          : null;
  const gate: CrmGate =
    sessionGate ??
    (academiesError
      ? "error"
      : needsAcademies && myAcademies === null
        ? "loading"
        : "ready");

  const actors = useMemo<CrmActor[]>(() => {
    if (!me) return [];
    const list: CrmActor[] = [];
    if (me.roles.includes("PRODUCER")) {
      list.push({
        actorType: "PRODUCER",
        actorId: me.id,
        label: `${t("actor.producer")} · ${me.name}`,
      });
    }
    for (const a of myAcademies ?? []) {
      if (a.ownerId !== me.id) continue; // instructor ≠ owner del CRM
      list.push({
        actorType: "ACADEMY",
        actorId: a.id,
        label: `${t("actor.academy")} · ${a.name}`,
      });
    }
    return list;
  }, [me, myAcademies, t]);

  const [actorSel, setActorSel] = useState("");
  const [manual, setManual] = useState<CrmActor | null>(null);
  const [manualType, setManualType] = useState<ActorType>("PRODUCER");
  const [manualId, setManualId] = useState("");

  // Actor por defecto: el primero disponible; ADMIN sin actores cae
  // en la entrada manual.
  useEffect(() => {
    if (gate === "ready" && actorSel === "") {
      setActorSel(actors.length > 0 ? actorKey(actors[0]) : isAdmin ? "manual" : "");
    }
  }, [gate, actors, actorSel, isAdmin]);

  const boot = useCallback(async () => {
    setAcademiesError(false);
    setMyAcademies(null);
    setAcademiesNonce((n) => n + 1);
    await refreshMe();
  }, [refreshMe]);

  function applyManual() {
    const id = manualId.trim();
    if (!id) return;
    setManual({
      actorType: manualType,
      actorId: id,
      label: `${manualType} · ${id.slice(0, 8)}`,
    });
  }

  const actor =
    actorSel === "manual"
      ? manual
      : (actors.find((a) => actorKey(a) === actorSel) ?? null);

  // El CRM del productor propio es feature Pro (S5): el API responde
  // 403 pro.required en todos sus endpoints — el front lo anticipa.
  const proBlocked =
    actor?.actorType === "PRODUCER" &&
    actor.actorId === meId &&
    effectivePro === false;

  return {
    gate,
    boot,
    actors,
    actor,
    actorSel,
    setActorSel,
    isAdmin,
    proBlocked,
    manualType,
    setManualType,
    manualId,
    setManualId,
    applyManual,
  };
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-night-700 bg-night-950 px-3 text-sm " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

/** Estados previos al contenido: carga, sin sesión, sin permiso, error. */
export function CrmGateScreen({
  gate,
  onRetry,
}: {
  gate: CrmGate;
  onRetry: () => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  if (gate === "loading") return <PageLoading />;

  if (gate === "unauth") {
    return (
      <Button href="/login" size="lg" className="self-start">
        {tc("login")}
      </Button>
    );
  }

  if (gate === "forbidden") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-white/70">{t("forbidden")}</p>
        <Button href="/inicio" variant="secondary">
          {tc("appName")}
        </Button>
      </div>
    );
  }

  if (gate === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-white/70">{tc("error")}</p>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return null;
}

/** Selector de actor CRM: los propios + entrada manual para ADMIN. */
export function ActorPicker({ ctx }: { ctx: CrmContextValue }) {
  const t = useTranslations("crm");

  if (ctx.actors.length === 0 && !ctx.isAdmin) {
    return <p className="text-white/60">{t("noActor")}</p>;
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t("actor.label")}>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-white/70">{t("actor.label")}</span>
        <select
          value={ctx.actorSel}
          onChange={(e) => ctx.setActorSel(e.target.value)}
          className={inputCls}
        >
          {ctx.actors.map((a) => (
            <option key={actorKey(a)} value={actorKey(a)}>
              {a.label}
            </option>
          ))}
          {ctx.isAdmin && <option value="manual">{t("actor.manual")}</option>}
        </select>
      </label>

      {ctx.actorSel === "manual" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm text-white/70">{t("actor.type")}</span>
            <select
              value={ctx.manualType}
              onChange={(e) => ctx.setManualType(e.target.value as ActorType)}
              className={inputCls}
            >
              <option value="PRODUCER">{t("actor.producer")}</option>
              <option value="ACADEMY">{t("actor.academy")}</option>
            </select>
          </label>
          <label className="flex flex-[2] flex-col gap-2">
            <span className="text-sm text-white/70">{t("actor.id")}</span>
            <input
              type="text"
              value={ctx.manualId}
              onChange={(e) => ctx.setManualId(e.target.value)}
              className={inputCls}
              autoComplete="off"
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={!ctx.manualId.trim()}
            onClick={ctx.applyManual}
          >
            {t("actor.apply")}
          </Button>
        </div>
      )}
    </section>
  );
}

export type CrmSection = "people" | "campaigns" | "triggers";

const SECTION_HREF: Record<CrmSection, string> = {
  people: "/crm",
  campaigns: "/crm/campanas",
  triggers: "/crm/triggers",
};

/** Navegación entre secciones del CRM — estilo tabs de admin/page.tsx. */
export function CrmNav({ active }: { active: CrmSection }) {
  const t = useTranslations("crm");
  return (
    <nav className="flex gap-2 overflow-x-auto" aria-label={t("title")}>
      {(Object.keys(SECTION_HREF) as CrmSection[]).map((k) => (
        <Link
          key={k}
          href={SECTION_HREF[k]}
          aria-current={active === k ? "page" : undefined}
          className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-sm font-semibold transition ${
            active === k ? "bg-neon text-black" : "bg-white/10 text-white/70"
          }`}
        >
          {t(`nav.${k}`)}
        </Link>
      ))}
    </nav>
  );
}
