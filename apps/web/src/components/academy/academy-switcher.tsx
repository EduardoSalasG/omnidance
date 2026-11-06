"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useRouter } from "@/i18n/navigation";
import { academyTierHas } from "@/lib/academy-features";
import {
  selectStoredAcademy,
  useStoredAcademyId,
} from "@/lib/academy-selection";
import { inputCls, type Academy } from "./shared";

/**
 * Selector de academia en la navegación del owner (drawer móvil y
 * sidebar desktop): segunda superficie del mismo estado persistido
 * que maneja el selector del hub (AcademyGate, spec
 * academies/console-lists). Solo se muestra cuando el owner tiene
 * más de una academia propia o alguna propia cubre multiAcademy
 * (misma regla que POST /academies). El cambio se propaga por
 * ACADEMY_CHANGED_EVENT vía selectStoredAcademy: gate, entitlements
 * y otras instancias re-resuelven sin recarga.
 */
export function AcademySwitcher({
  onNavigate,
}: {
  /** Se invoca tras cualquier elección (el drawer móvil se cierra). */
  onNavigate?: () => void;
}) {
  const t = useTranslations("academy");
  const router = useRouter();
  const { me } = useMe();
  const [academies, setAcademies] = useState<Academy[] | null>(null);
  const stored = useStoredAcademyId();

  // Mismo dedup que AcademyGate: multi-membresía (owner+instructor) o
  // nombres duplicados no repiten opciones.
  const load = useCallback(async () => {
    const res = await apiFetch("/academies/mine").catch(() => null);
    if (!res?.ok) return;
    const list = (await res.json()) as Academy[];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    setAcademies(
      list.filter((a) => {
        const name = a.name.trim().toLowerCase();
        if (seenIds.has(a.id) || seenNames.has(name)) return false;
        seenIds.add(a.id);
        seenNames.add(name);
        return true;
      }),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Selección persistida apuntando a una academia que la lista aún no
  // conoce (recién creada en otra superficie): un solo refetch por id.
  const retriedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!academies || !stored) return;
    if (academies.some((a) => a.id === stored)) return;
    if (retriedFor.current === stored) return;
    retriedFor.current = stored;
    void load();
  }, [academies, stored, load]);

  if (!me || academies == null || academies.length === 0) return null;

  // Misma derivación que AcademyGate: ACADEMY_OWNER APPROVED/PENDING
  // puede crear; "Nueva academia" exige multiAcademy en alguna propia
  // (o bypass de admin de plataforma).
  const canCreate = (me.roleStates ?? []).some(
    (r) =>
      r.role === "ACADEMY_OWNER" &&
      (r.status === "APPROVED" || r.status === "PENDING"),
  );
  const isPlatformAdmin = me.roles.includes("ADMIN");
  const owned = academies.filter((a) => a.ownerId === me.id);
  const canAddAcademy =
    canCreate &&
    (isPlatformAdmin ||
      owned.length === 0 ||
      owned.some((a) => academyTierHas(a.tier, "multiAcademy")));

  // Regla de visibilidad: solo si hay >1 academia propia para alternar
  // o el plan permite crear más. Una sola academia sin multiAcademy
  // vuelve el selector ruido sin acción.
  if (owned.length <= 1 && !canAddAcademy) return null;

  const selectedId =
    stored && academies.some((a) => a.id === stored)
      ? stored
      : academies[0].id;

  return (
    <select
      aria-label={t("title")}
      className={inputCls}
      value={selectedId}
      onChange={(e) => {
        const value = e.target.value;
        onNavigate?.();
        if (value === "__new") {
          router.push("/academia/nueva");
          return;
        }
        selectStoredAcademy(value);
      }}
    >
      {academies.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {canAddAcademy && <option value="__new">＋ {t("newAcademy")}</option>}
    </select>
  );
}
