"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";

type Gate = "loading" | "unauth" | "notAdmin" | "error" | "ready";

// Gate de acceso admin: verifica sesión + rol ADMIN vía GET /api/me y renderiza
// children solo cuando la verificación pasa. Los children se montan recién en
// "ready", así que sus fetches de datos nunca corren para no-admins.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) return setGate("unauth");
      if (!me.ok) return setGate("error");
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.includes("ADMIN")) return setGate("notAdmin");
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (gate === "loading") {
    return (
      <p role="status" className="text-white/60">
        {tc("loading")}
      </p>
    );
  }

  if (gate === "unauth") {
    return (
      <Button href="/login" size="lg" className="self-start">
        {tc("login")}
      </Button>
    );
  }

  if (gate === "notAdmin") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-white/70">{t("notAdmin")}</p>
        <Button href="/inicio" variant="secondary">
          {tc("appName")}
        </Button>
      </div>
    );
  }

  if (gate === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-white/70">
          {tc("error")}
        </p>
        <Button variant="secondary" onClick={() => void boot()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
