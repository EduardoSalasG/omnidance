"use client";

import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";

/**
 * Aviso de trial de plataforma terminado (spec platform-trials §corte):
 * la academia sin suscripción viva y con trialEndsAt vencido queda sin
 * features - la consola solo ofrece Inicio, Suscripción y Perfil, y el
 * inicio muestra este aviso con la salida a la suscripción.
 */
export function AcademyTrialEnded() {
  const t = useTranslations("academy.trialEnded");
  return (
    <Card className="flex flex-col items-start gap-3">
      <p className="font-semibold">{t("title")}</p>
      <p className="text-sm text-ink/60">{t("desc")}</p>
      <Button href="/academia/configuracion/suscripcion" className="self-start">
        {t("cta")}
      </Button>
    </Card>
  );
}
