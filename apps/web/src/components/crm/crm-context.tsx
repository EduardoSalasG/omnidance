"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useActorEntitlements } from "@/lib/entitlements-context";
import { Button, RefreshIcon } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type { CrmActor } from "./types";

// Roles con permiso crm.manage (seed-common ROLE_GRANTS) - ADMIN pasa por
// isSuperuser. Espejo client-side del RolesGuard; el backend valida igual.
const CRM_ROLES = new Set(["PRODUCER", "ACADEMY_OWNER", "ADMIN"]);

type CrmGate = "loading" | "unauth" | "forbidden" | "error" | "ready";

type CrmContextValue = {
  gate: CrmGate;
  boot: () => Promise<void>;
  actors: CrmActor[];
  actor: CrmActor | null;
  /** El actor resuelto no cubre la feature "crm" en su plan (productor
      sin Pro, academia COBROS/STUDIO - contrato unificado del spec
      unified-actor-entitlements): el API responde 403 tier.required en
      todos sus endpoints - las páginas renderizan el TierPaywall en vez
      del contenido. */
  blocked: boolean;
};

/**
 * Resuelve el actor CRM del usuario (sin selector - siempre es el de la
 * sesión):
 * - PRODUCER → su propio CRM (actorId = personId).
 * - ACADEMY_OWNER → la academia seleccionada en su consola
 *   (localStorage omnidance:academy-id; fallback: la primera donde es
 *   owner - assertActorAccess solo acepta ownerId, no instructores).
 * - Con ambos roles gana la academia seleccionada si existe; si no, el
 *   primer actor disponible.
 */
export function useCrmContext(): CrmContextValue {
  const t = useTranslations("crm");

  // /me compartido (MeProvider) - sin fetch propio de sesión. Las
  // academias del owner se piden en paralelo (especulativo mientras /me
  // sigue en vuelo; si el usuario no resulta owner se descartan).
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const meId = me?.id ?? "";

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

  // Actor automático: la academia seleccionada en la consola del owner
  // (misma key que AcademyGate/AcademyKpiStrip); si no, el primero.
  const actor = useMemo<CrmActor | null>(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("omnidance:academy-id");
    } catch {
      // Sin storage (modo privado) - cae al primer actor.
    }
    return (
      actors.find(
        (a) => a.actorType === "ACADEMY" && a.actorId === stored,
      ) ?? actors[0] ?? null
    );
  }, [actors]);

  const boot = useCallback(async () => {
    setAcademiesError(false);
    setMyAcademies(null);
    setAcademiesNonce((n) => n + 1);
    await refreshMe();
  }, [refreshMe]);

  // Gateo anticipado por feature (contrato unificado, spec
  // unified-actor-entitlements): el API responde 403 tier.required en
  // todos los endpoints del CRM cuando el actor no cubre "crm" - el
  // front lo anticipa con los entitlements de la sesión (productor sin
  // Pro ↔ academia COBROS/STUDIO). Mientras cargan no se bloquea: el
  // 403 queda como fallback.
  const producerEnt = useActorEntitlements("PRODUCER");
  const academyEnt = useActorEntitlements(
    "ACADEMY",
    actor?.actorType === "ACADEMY" ? actor.actorId : null,
  );
  const actorEnt = actor
    ? actor.actorType === "PRODUCER" && actor.actorId === meId
      ? producerEnt
      : actor.actorType === "ACADEMY"
        ? academyEnt
        : null
    : null;
  const blocked =
    actorEnt != null && !actorEnt.loading && !actorEnt.has("crm");

  return {
    gate,
    boot,
    actors,
    actor,
    blocked,
  };
}

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
        <p className="text-ink/70">{t("forbidden")}</p>
        <Button href="/inicio" variant="secondary">
          {tc("appName")}
        </Button>
      </div>
    );
  }

  if (gate === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-ink/70">{tc("error")}</p>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return null;
}

// La navegación entre secciones del CRM vive en el drawer/sidebar
// (CRM_DRAWER_GROUP de BottomNav, spec crm-sidebar-section) - ya no hay
// tabs internas.
