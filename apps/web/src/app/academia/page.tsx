"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { AcademyConsole } from "@/components/academy/academy-console";
import { inputCls, readError, type Academy } from "@/components/academy/shared";

type Gate = "loading" | "unauth" | "empty" | "ready" | "error";

/**
 * /academia — consola de operación diaria de la academia.
 * Gate: GET /academies/mine → 401 login, [] crear academia, [a..] consola.
 * `mine` incluye academias como owner o como instructor (findMany ordenado
 * por createdAt) — si hay varias se ofrece selector.
 */
export default function AcademiaPage() {
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
      setSelectedId((prev) =>
        prev && list.some((a) => a.id === prev) ? prev : list[0].id,
      );
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {gate === "loading" && <p className="text-white/60">{tc("loading")}</p>}

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
        </div>
      )}

      {gate === "ready" && (
        <>
          {academies.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("title")}</span>
              <select
                className={inputCls}
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedId && (
            <AcademyConsole
              key={selectedId}
              academy={academies.find((a) => a.id === selectedId)!}
            />
          )}
        </>
      )}
    </main>
  );
}
