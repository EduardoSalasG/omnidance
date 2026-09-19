"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { Param } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function ParametrosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader
        backHref="/admin"
        backLabel={t("title")}
        title={t("tabs.params")}
      />
      <AdminGate>
        <ParamsPanel />
      </AdminGate>
    </main>
  );
}

function ParamsPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [params, setParams] = useState<Param[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await apiFetch("/admin/params");
    if (!res.ok) throw new Error("fetch failed");
    const rows = (await res.json()) as Param[];
    setParams(rows);
    setDrafts(
      Object.fromEntries(rows.map((p) => [p.key, JSON.stringify(p.value)])),
    );
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  async function saveParam(key: string) {
    if (acting) return;
    setActing(key);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/params/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: parseValue(drafts[key] ?? "") }),
      });
      if (!res.ok) return setActionError(true);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
      await load();
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <p className="text-xs text-white/50">{t("params.hint")}</p>
        <ul className="flex flex-col gap-3">
          {params.map((p) => (
            <li key={p.key}>
              <Card className="flex flex-col gap-2">
                <span className="font-mono text-sm text-neon">{p.key}</span>
                {p.description && (
                  <span className="text-xs text-white/50">
                    {p.description}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[p.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [p.key]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-black/40 px-3 font-mono text-sm"
                    aria-label={p.key}
                  />
                  <Button
                    size="sm"
                    disabled={
                      acting !== null ||
                      drafts[p.key] === JSON.stringify(p.value)
                    }
                    onClick={() => void saveParam(p.key)}
                  >
                    {savedKey === p.key ? t("saved") : tc("save")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
