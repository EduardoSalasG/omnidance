"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { inputCls, readError } from "./shared";
import { CAPS, EMPTY_CAPS, CapCheckbox, type Caps } from "./staff-section";
import { useRouter } from "@/i18n/navigation";

/**
 * Alta de miembro del equipo - vive en /academia/equipo/nuevo.
 * Selector de tipo: Colaborador (POST /academies/:id/staff con caps) o
 * Profesor (POST /academies/:id/instructors con comisión opcional).
 * Si la persona no tiene cuenta se crea stub + invitación
 * (body.invited → mensaje distinto) en ambos casos. Los toggles por
 * fila, la comisión y las bajas quedan en el listado.
 */
export function StaffForm({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  // Tipo de miembro: colaborador (caps de consola) o profesor
  // (membresía AcademyInstructor + comisión opcional).
  const [kind, setKind] = useState<"staff" | "instructor">("staff");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [newCaps, setNewCaps] = useState<Caps>(EMPTY_CAPS);
  // Acuerdo económico del profesor: PER_CLASS (monto/clase), MONTHLY
  // (monto mensual por N clases) o COMMISSION (% que retiene la
  // academia por particular). null = se configura después.
  const [payType, setPayType] = useState<
    "PER_CLASS" | "MONTHLY" | "COMMISSION" | null
  >(null);
  const [payAmount, setPayAmount] = useState("");
  const [payClasses, setPayClasses] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const agreement =
        kind === "instructor" && payType
          ? {
              payType,
              payAmount:
                payType !== "COMMISSION" && payAmount.trim() !== ""
                  ? Number(payAmount)
                  : undefined,
              payClasses:
                payType === "MONTHLY" && payClasses.trim() !== ""
                  ? Number(payClasses)
                  : undefined,
              commissionPct:
                payType === "COMMISSION" && commissionPct.trim() !== ""
                  ? Number(commissionPct)
                  : undefined,
            }
          : {};
      const res = await apiFetch(
        kind === "instructor"
          ? `/academies/${academyId}/instructors`
          : `/academies/${academyId}/staff`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            name: name.trim() || undefined,
            ...(kind === "instructor" ? agreement : newCaps),
          }),
        },
      );
      if (!res.ok) {
        showActionNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      const body = (await res.json()) as { invited: boolean };
      showActionNotice({
        text: body.invited
          ? t("invitedMsg")
          : kind === "instructor"
            ? t("instructorAdded")
            : t("added"),
      });
      router.push("/academia/equipo");
    } catch {
      showActionNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("addTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("addDesc")}</p>
      </div>
      <form onSubmit={add} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-ink/50">
            {t("kindLegend")}
          </legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["staff", "instructor"] as const).map((k) => (
              <label
                key={k}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon ${
                  kind === k
                    ? "border-neon bg-neon/10 text-neon"
                    : "border-line text-ink/70 hover:border-neon/40"
                }`}
              >
                <input
                  type="radio"
                  name="member-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                {t(k === "staff" ? "kindStaff" : "kindInstructor")}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">
            {t("fieldEmail")}
            <span aria-hidden="true" className="text-neon">
              {" "}
              *
            </span>
          </span>
          <input
            type="email"
            required
            className={inputCls}
            placeholder={t("fieldEmailPh")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("fieldName")}</span>
          <input
            className={inputCls}
            placeholder={t("fieldNamePh")}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {kind === "instructor" ? (
          <>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs text-ink/50">
                {t("agreementLegend")}
              </legend>
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                role="radiogroup"
              >
                {([null, "MONTHLY", "PER_CLASS", "COMMISSION"] as const).map(
                  (k) => (
                    <label
                      key={k ?? "none"}
                      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon ${
                        payType === k
                          ? "border-neon bg-neon/10 text-neon"
                          : "border-line text-ink/70 hover:border-neon/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="new-pay-type"
                        checked={payType === k}
                        onChange={() => setPayType(k)}
                        className="sr-only"
                      />
                      {k === null
                        ? t("payTypeNone")
                        : k === "MONTHLY"
                          ? t("payMonthly")
                          : k === "PER_CLASS"
                            ? t("payPerClass")
                            : t("payCommission")}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            {payType === "COMMISSION" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink/50">
                  {t("fieldCommissionPct")}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  required
                  className={inputCls}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                />
              </label>
            )}
            {(payType === "PER_CLASS" || payType === "MONTHLY") && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink/50">
                  {t("fieldPayAmount")}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  required
                  className={inputCls}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </label>
            )}
            {payType === "MONTHLY" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink/50">
                  {t("fieldPayClasses")}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  required
                  className={inputCls}
                  value={payClasses}
                  onChange={(e) => setPayClasses(e.target.value)}
                />
              </label>
            )}
          </>
        ) : (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs text-ink/50">
              {t("capsLegend")}
            </legend>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {CAPS.map((cap) => (
                <CapCheckbox
                  key={cap}
                  cap={cap}
                  checked={newCaps[cap]}
                  onToggle={(c, next) =>
                    setNewCaps((prev) => ({ ...prev, [c]: next }))
                  }
                />
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {t("add")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => router.push("/academia/equipo")}
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
