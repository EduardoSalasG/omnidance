"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { Button, RefreshIcon } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { PRODUCER_ROLES } from "./shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

/**
 * Gate de la consola /productor: sesión + rol (PRODUCER/ADMIN) del /me
 * compartido (MeProvider); renderiza children solo con acceso confirmado.
 * Data-free a propósito: cada módulo fetchea lo que necesita al montar.
 */
export function ProducerGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => PRODUCER_ROLES.has(r))
          ? "notProducer"
          : "ready";

  if (gate === "loading") {
    return <PageLoading />;
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
        <p className="text-ink/70">{t("notProducer")}</p>
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
        <Button variant="secondary" onClick={() => void refreshMe()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
