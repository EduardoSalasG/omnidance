"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useActiveRole } from "@/lib/active-role";
import { Button, Card, SkeletonList } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AcademyGate } from "@/components/academy/academy-gate";
import { useAcademyAccess } from "@/components/academy/use-academy-access";
import { ConsoleHeader } from "@/components/console/console-header";
import { showActionNotice } from "@/components/ui/action-notice";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";

/**
 * /academia/alumnos/invitar - invitación de registro (spec
 * academies/student-invites): la academia invita a una persona SIN
 * crearle enrollment - se registra por el magic link, aterriza en la
 * ficha pública de la academia y se inscribe sola. Canal de
 * adquisición, no gestión de nómina (eso es /academia/alumnos/nuevo).
 * Gatea con cap `students` (mismo permiso que el endpoint).
 */
export default function AcademiaInvitarAlumnoPage() {
  const th = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia/alumnos" backLabel={th("students")} />
      <AcademyGate>
        {({ academy }) => (
          <InviteLoader
            key={academy.id}
            academyId={academy.id}
            ownerId={academy.ownerId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function InviteLoader({
  academyId,
  ownerId,
}: {
  academyId: string;
  ownerId: string;
}) {
  const t = useTranslations("academy.invites");
  const tc = useTranslations("common");
  const router = useRouter();

  // Misma regla que la página de alumnos: owner/ADMIN o staff con cap
  // `students`; la lente INSTRUCTOR degrada aunque haya más privilegios.
  const { me, loading: meLoading } = useMe();
  const instructorLens = useActiveRole(me?.roles) === "INSTRUCTOR";
  const access = useAcademyAccess(academyId);
  const canInvite: boolean | null =
    meLoading || access === null
      ? null
      : !instructorLens &&
        !!me &&
        (me.roles.includes("ADMIN") ||
          me.id === ownerId ||
          access.caps.students === true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/academies/${academyId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        }),
      });
      if (!res.ok) {
        showActionNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      const data = (await res.json()) as { resent?: boolean };
      showActionNotice({
        text: data.resent ? t("resent") : t("sent"),
      });
      router.push("/academia/alumnos");
    } catch {
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (canInvite === null) {
    return <SkeletonList />;
  }
  if (canInvite === false) {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("forbidden")}
      </p>
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-ink/50">{t("hint")}</p>
      <form
        onSubmit={submit}
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-ink/50">
            {t("emailLabel")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">
            {t("nameLabel")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="text"
            required
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("lastNameLabel")}</span>
          <input
            type="text"
            autoComplete="off"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Spinner size="sm" />}
            {t("submit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => router.push("/academia/alumnos")}
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
