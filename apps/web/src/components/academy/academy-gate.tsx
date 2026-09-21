"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { PrivateLessons } from "./private-lessons";
import { inputCls, readError, type Academy } from "./shared";

type Gate = "loading" | "unauth" | "empty" | "ready" | "error";

// Academia seleccionada persiste entre el hub y las subrutas de módulo.
const STORAGE_KEY = "omnidance:academy-id";

/**
 * Gate compartido de /academia y sus subrutas: GET /academies/mine →
 * 401 login, [] crear academia, [a..] selector + contenido vía render-prop.
 * `mine` incluye academias como owner o como instructor (findMany ordenado
 * por createdAt) — si hay varias se ofrece selector persistido en
 * localStorage para que el hub y los módulos muestren la misma academia.
 *
 * En el estado empty se mantiene la vista alumno (PrivateLessons sin
 * academy → "mis solicitudes") salvo que el caller pase
 * showStudentLessons={false}; preserva el acceso a las solicitudes de
 * clases particulares aunque el usuario no tenga academia propia.
 */
export function AcademyGate({
  children,
  showStudentLessons = true,
}: {
  children: (ctx: {
    academy: Academy;
    academies: Academy[];
  }) => React.ReactNode;
  showStudentLessons?: boolean;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
      if (list.length === 0) {
        setGate("empty");
        return;
      }
      setAcademies(list);
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // Sin storage (modo privado) — se usa la primera academia.
      }
      setSelectedId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        if (stored && list.some((a) => a.id === stored)) return stored;
        return list[0].id;
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
      // Sin storage — la selección vive solo en memoria.
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCreateError(null);
    try {
      const res = await apiFetch("/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        // 403 = sin rol ACADEMY_OWNER — el message del server lo explica.
        setCreateError((await readError(res)) ?? tc("error"));
        return;
      }
      setName("");
      await boot();
    } catch {
      setCreateError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  const selected = academies.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      {gate === "loading" && <PageLoading />}

      {gate === "unauth" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "empty" && (
        <div className="flex flex-col gap-4">
          <p className="text-white/70">{t("empty")}</p>
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("create")}
            </h2>
            <form onSubmit={create} className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t("academyName")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              {createError && (
                <p role="alert" className="text-sm text-red-400">
                  {createError}
                </p>
              )}
              <div>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? tc("loading") : tc("create")}
                </Button>
              </div>
            </form>
          </Card>
          {/* Vista alumno: sin academias propias aún puede tener
              solicitudes de clases particulares (/private-lessons/mine). */}
          {showStudentLessons && <PrivateLessons academies={academies} />}
        </div>
      )}

      {gate === "ready" && selected && (
        <>
          {academies.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("title")}</span>
              <select
                className={inputCls}
                value={selectedId ?? ""}
                onChange={(e) => selectAcademy(e.target.value)}
              >
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {children({ academy: selected, academies })}
        </>
      )}
    </>
  );
}
