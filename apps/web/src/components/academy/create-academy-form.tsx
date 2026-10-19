"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

/**
 * Form de alta de academia (POST /academies) - compartido entre el
 * estado `empty` del AcademyGate (primera academia) y /academia/nueva
 * (segunda+). onCreated decide el flujo: el gate re-boots, la página
 * persiste la selección y vuelve al hub.
 */
export function CreateAcademyForm({
  onCreated,
}: {
  onCreated: (academy: Academy) => void | Promise<void>;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
        // 403 = sin rol ACADEMY_OWNER - el message del server lo explica.
        setCreateError((await readError(res)) ?? tc("error"));
        return;
      }
      setName("");
      await onCreated((await res.json()) as Academy);
    } catch {
      setCreateError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-3 flex flex-col gap-3 lg:max-w-xl">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink/50">
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
  );
}
