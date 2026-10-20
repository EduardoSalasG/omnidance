"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, RefreshIcon } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import { PageLoading } from "@/components/ui/spinner";
import { AcademyBillingBanner } from "./academy-billing-banner";
import { CreateAcademyForm } from "./create-academy-form";
import { ACADEMY_STORAGE_KEY, inputCls, type Academy } from "./shared";

type Gate = "loading" | "unauth" | "empty" | "ready" | "error";

const STORAGE_KEY = ACADEMY_STORAGE_KEY;

/**
 * Gate compartido de /academia y sus subrutas: GET /academies/mine →
 * 401 login, [] crear academia, [a..] selector + contenido vía render-prop.
 * `mine` incluye academias como owner o como instructor (findMany ordenado
 * por createdAt) - si hay varias se ofrece selector persistido en
 * localStorage para que el hub y los módulos muestren la misma academia.
 */
export function AcademyGate({
  children,
}: {
  children: (ctx: {
    academy: Academy;
    academies: Academy[];
  }) => React.ReactNode;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const [gate, setGate] = useState<Gate>("loading");
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ACADEMY_OWNER (APPROVED o PENDING - registrado por landing) puede
  // crear academias adicionales; instructor/staff de otras no ven el CTA.
  const { me } = useMe();
  const canCreate = (me?.roleStates ?? []).some(
    (r) =>
      r.role === "ACADEMY_OWNER" &&
      (r.status === "APPROVED" || r.status === "PENDING"),
  );

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const res = await apiFetch("/academies/mine");
      if (res.status === 401) {
        setGate("unauth");
        return;
      }
      if (!res.ok) {
        setGate("error");
        return;
      }
      const list = (await res.json()) as Academy[];
      // Dedup defensivo: si la misma academia llega repetida (multi-
      // membresía owner+instructor) o dos filas comparten el nombre, el
      // selector no repite la opción (spec academies/console-lists).
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const deduped = list.filter((a) => {
        const name = a.name.trim().toLowerCase();
        if (seenIds.has(a.id) || seenNames.has(name)) return false;
        seenIds.add(a.id);
        seenNames.add(name);
        return true;
      });
      if (deduped.length === 0) {
        setGate("empty");
        return;
      }
      setAcademies(deduped);
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // Sin storage (modo privado) - se usa la primera academia.
      }
      setSelectedId((prev) => {
        if (prev && deduped.some((a) => a.id === prev)) return prev;
        if (stored && deduped.some((a) => a.id === stored)) return stored;
        return deduped[0].id;
      });
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  function selectAcademy(id: string) {
    setSelectedId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin storage - la selección vive solo en memoria.
    }
  }

  const selected = academies.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      {gate === "loading" && <PageLoading />}

      {gate === "unauth" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void boot()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "empty" && (
        <div className="flex flex-col gap-4">
          <p className="text-ink/70">{t("empty")}</p>
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("create")}
            </h2>
            <CreateAcademyForm onCreated={() => void boot()} />
          </Card>
        </div>
      )}

      {gate === "ready" && selected && (
        <>
          {/* Mora SaaS: banner de gracia/bloqueo arriba de todo el
              contenido de la consola (en /academia/suscripcion el
              componente se auto-omite - el estado va detallado ahí). */}
          <AcademyBillingBanner academy={selected} />
          <div className="flex flex-wrap items-center gap-2">
            {(academies.length > 1 || canCreate) && (
              <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
                <span className="sr-only">{t("title")}</span>
                {/* La opción "Nueva academia" vive dentro del selector
                    (un solo sitio) - antes era un botón repetido en
                    todas las páginas de la consola. */}
                <select
                  className={inputCls}
                  value={selectedId ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "__new") {
                      router.push("/academia/nueva");
                      return;
                    }
                    selectAcademy(e.target.value);
                  }}
                >
                  {academies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  {canCreate && (
                    <option value="__new">＋ {t("newAcademy")}</option>
                  )}
                </select>
              </label>
            )}
          </div>
          {children({ academy: selected, academies })}
        </>
      )}
    </>
  );
}
