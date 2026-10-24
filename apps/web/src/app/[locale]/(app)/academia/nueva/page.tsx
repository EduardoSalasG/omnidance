"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useMe } from "@/lib/me-context";
import { useEntitlements } from "@/lib/entitlements-context";
import { Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { TierPaywall } from "@/components/tier-paywall";
import { ConsoleHeader } from "@/components/console/console-header";
import { CreateAcademyForm } from "@/components/academy/create-academy-form";
import { ACADEMY_STORAGE_KEY, type Academy } from "@/components/academy/shared";

/**
 * /academia/nueva - alta de una academia adicional (patrón crear =
 * página dedicada). La primera academia nace en el estado `empty` del
 * AcademyGate; esta página cubre la segunda+ del owner. Al crear, la
 * selección persiste en ACADEMY_STORAGE_KEY para que el gate la deje
 * activa al volver al hub.
 */
export default function NuevaAcademiaPage() {
  const t = useTranslations("academy");
  const router = useRouter();
  const { me, loading } = useMe();

  const canCreate = (me?.roleStates ?? []).some(
    (r) =>
      r.role === "ACADEMY_OWNER" &&
      (r.status === "APPROVED" || r.status === "PENDING"),
  );

  // Multi-academia = feature PRO (spec academy-tier-v2): la segunda+
  // academia exige `multiAcademy` en alguna academia propia; la primera
  // es gratis y el admin de plataforma pasa sin gate (misma regla que
  // POST /academies). `ent.academies` lista solo academias OWNED.
  const ent = useEntitlements();
  const isPlatformAdmin = me?.roles.includes("ADMIN") ?? false;
  const multiAcademyLocked =
    !isPlatformAdmin &&
    ent.academies.length > 0 &&
    !ent.academies.some((a) => a.features.includes("multiAcademy"));
  // Los entitlements solo se fetchean para ACADEMY_OWNER/PRODUCER -
  // para el resto loading ya está en false (no bloquear el gate).
  const entLoading =
    (me?.roles.includes("ACADEMY_OWNER") ?? false) && ent.loading;

  function onCreated(academy: Academy) {
    try {
      window.localStorage.setItem(ACADEMY_STORAGE_KEY, academy.id);
    } catch {
      // Sin storage - el gate cae a la primera academia del listado.
    }
    router.push("/academia");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />

      {(loading || entLoading) && <PageLoading />}

      {!loading && !entLoading && canCreate && multiAcademyLocked && (
        // El POST /academies igual responde 403 tier.required - esto es
        // la superficie proactiva (upgrade a PRO).
        <TierPaywall actorType="ACADEMY" feature="multiAcademy" />
      )}

      {!loading && !entLoading && !canCreate && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-ink/70">{t("forbidden")}</p>
          <Button href="/academia" variant="secondary">
            {t("title")}
          </Button>
        </div>
      )}

      {!loading && !entLoading && canCreate && !multiAcademyLocked && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("newAcademy")}</h2>
          <Card>
            <CreateAcademyForm onCreated={onCreated} />
          </Card>
        </section>
      )}
    </main>
  );
}
