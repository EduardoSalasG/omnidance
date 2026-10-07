"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { Button, RefreshIcon } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";

type Gate = "loading" | "unauth" | "notAdmin" | "error" | "ready";

// Gate de acceso admin: sesión + rol ADMIN del /me compartido (MeProvider)
// y renderiza children solo cuando la verificación pasa. Los children se
// montan recién en "ready", así que sus fetches de datos nunca corren
// para no-admins.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
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
        : !me.roles.includes("ADMIN")
          ? "notAdmin"
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

  if (gate === "notAdmin") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-ink/70">{t("notAdmin")}</p>
        <Button href="/inicio" variant="secondary">
          {tc("appName")}
        </Button>
      </div>
    );
  }

  if (gate === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-ink/70">
          {tc("error")}
        </p>
        <Button variant="secondary" onClick={() => void refreshMe()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
