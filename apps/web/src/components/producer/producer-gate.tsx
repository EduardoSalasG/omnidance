"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { PRODUCER_ROLES } from "./shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

/**
 * Gate de la consola /productor: valida sesión + rol (PRODUCER/ADMIN) vía
 * GET /me y renderiza children solo cuando el acceso está confirmado.
 * Data-free a propósito: cada módulo fetchea lo que necesita al montar.
 */
export function ProducerGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) {
        setGate("unauth");
        return;
      }
      if (!me.ok) {
        setGate("error");
        return;
      }
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.some((r) => PRODUCER_ROLES.has(r))) {
        setGate("notProducer");
        return;
      }
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (gate === "loading") {
    return <p className="text-white/60">{tc("loading")}</p>;
  }

  if (gate === "unauth") {
    return (
      <Button href="/login" size="lg" className="self-start">
        {tc("login")}
      </Button>
    );
  }

  if (gate === "notProducer") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-white/70">{t("notProducer")}</p>
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
        <Button variant="secondary" onClick={() => void boot()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
