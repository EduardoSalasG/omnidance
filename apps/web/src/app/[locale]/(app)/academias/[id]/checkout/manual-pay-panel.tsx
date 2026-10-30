"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { useNumFmt } from "@/lib/intl";

type PaymentMethod = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH";
  label: string;
  details: Record<string, string>;
};

type MyClaim = {
  id: string;
  amount: number;
  methodId: string | null;
  methodType: string;
  methodLabel: string;
  status: "AWAITING" | "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  planId: string | null;
  /** kind del claim (spec private-class-checkout): PLAN es el default
      del backfill; PRIVATE_CLASS identifica el intento de particular. */
  kind?: "PLAN" | "PRIVATE_CLASS";
};

// Orden pedido: nombre, RUT, banco, tipo de cuenta, N° de cuenta, email.
const TRANSFER_FIELDS: {
  key: "holder" | "rut" | "bank" | "accountType" | "accountNumber" | "email";
  label: string;
}[] = [
  { key: "holder", label: "fName" },
  { key: "rut", label: "fRut" },
  { key: "bank", label: "fBank" },
  { key: "accountType", label: "fAccountType" },
  { key: "accountNumber", label: "fAccountNumber" },
  { key: "email", label: "fEmail" },
];

;

/**
 * Selector de medio + flujo manual dentro del checkout de membresía
 * y de clase particular (specs academy-checkout-manual-pay y
 * private-class-checkout). Si la academia publica métodos propios, el
 * alumno elige entre la pasarela y un método directo; al confirmar se
 * registra el claim AWAITING (persiste si sale a transferir) y al
 * volver reanuda instrucciones + upload. Informa al padre si hay una
 * ruta manual activa para ocultar el CTA de la pasarela.
 */
export function ManualPayPanel({
  academyId,
  planId,
  privateClass = false,
  planPrice,
  returnHref,
  onBlockingChange,
}: {
  academyId: string;
  /** Checkout de plan: el intento va {planId, methodId} y el claim
      vivo se matchea por planId. */
  planId?: string;
  /** Checkout de clase particular: el intento va
      {privateClass:true, methodId} y el claim vivo se matchea por
      kind PRIVATE_CLASS. */
  privateClass?: boolean;
  planPrice: number;
  /** Destino tras enviar el comprobante (ficha de la academia): el
      aviso viaja por el host global y `replace` evita que "atrás"
      vuelva a un paso intermedio del checkout. Sin returnHref el
      panel queda en su estado PENDING (flujo membresía). */
  returnHref?: string;
  /** true cuando el panel tiene el control (método elegido o claim vivo). */
  onBlockingChange: (blocked: boolean) => void;
}) {
  const clp = useNumFmt({
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const router = useRouter();

  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [claim, setClaim] = useState<MyClaim | null>(null);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        apiFetch(`/academies/${academyId}/payment-methods`),
        apiFetch(`/academies/${academyId}/claims/mine`),
      ]);
      const methodRows: PaymentMethod[] = m.ok ? await m.json() : [];
      const claims: MyClaim[] = c.ok ? await c.json() : [];
      setMethods(methodRows);
      // El intento vivo de este producto manda: plan por planId,
      // particular por kind PRIVATE_CLASS. Si el último quedó REJECTED
      // se muestra el motivo y se permite un intento nuevo.
      const isMine = (r: MyClaim) =>
        privateClass ? r.kind === "PRIVATE_CLASS" : r.planId === planId;
      const live = claims.find(
        (r) =>
          isMine(r) &&
          (r.status === "AWAITING" || r.status === "PENDING"),
      );
      const lastRejected = claims.find(
        (r) => isMine(r) && r.status === "REJECTED",
      );
      setClaim(live ?? null);
      setRejectedNote(!live && lastRejected ? lastRejected.reviewNote : null);
      onBlockingChange(!!live);
    } catch {
      // Fallo de red: el panel igual se muestra con la pasarela
      // como única opción (manualActive queda en false) + error
      // visible, en vez de un panel invisible sin explicación.
      setMethods([]);
      setError(true);
    }
  }, [academyId, planId, privateClass, onBlockingChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // El CTA correcto cambia EN EL MISMO render que la selección: si el
  // bloqueo del padre viajara por effect habría un frame con los dos
  // botones (Pagar + Continuar) o sin ninguno - el "flash" al alternar.

  async function copy(key: string, text: string) {
    // Clipboard API exige contexto seguro + permiso; si no está o
    // rechaza, cae al execCommand clásico (textarea oculto + select).
    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    // Estado "Copiado" solo si de verdad copió: el botón muda a
    // confirmación ~1.5s; si ambos métodos fallaron, no muestra nada
    // (nunca un éxito falso sobre un clipboard que no funcionó).
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  function copyAll(method: PaymentMethod) {
    const lines = TRANSFER_FIELDS.filter((f) => method.details[f.key]).map(
      (f) => `${t(f.label)}: ${method.details[f.key]}`,
    );
    lines.push(`${t("fAmount")}: ${clp.format(planPrice)}`);
    void copy("all", lines.join("\n"));
  }

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/claims/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          privateClass
            ? { privateClass: true, methodId: selected }
            : { planId, methodId: selected },
        ),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setClaim(await res.json());
      setSelected(null);
      onBlockingChange(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function sendReceipt() {
    if (!file || !claim || busy) return;
    setBusy(true);
    setError(false);
    try {
      const fd = new FormData();
      fd.set("receipt", file, file.name);
      const res = await apiFetch(
        `/academies/${academyId}/claims/${claim.id}/receipt`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setClaim(await res.json());
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // Flujo particular: el claim quedó PENDING de revisión; aviso
      // global + vuelta a la ficha de la academia (mismo estándar que
      // OwnMethodClaim del checkout de eventos).
      if (returnHref) {
        showActionNotice({ text: t("sentOk") });
        router.replace(returnHref);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function cancelIntent() {
    if (!claim || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/claims/${claim.id}/cancel`,
        { method: "POST" },
      );
      if (res.ok) {
        setClaim(null);
        onBlockingChange(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (methods === null) return null;
  // Sin métodos propios tampoco se oculta el panel: el alumno siempre
  // ve con qué va a pagar (la pasarela queda como única opción marcada).

  const activeMethod = claim?.methodId
    ? (methods.find((m) => m.id === claim.methodId) ?? null)
    : null;

  return (
    <>
      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">{t("chooseMethod")}</h2>

        {/* Comprobante o pago en efectivo ya en la cola de la
            academia: CASH no pide receipt, el intento nace PENDING. */}
          {claim?.status === "PENDING" && (
        <div className="flex flex-col gap-2">
          <Badge variant="muted">
            {claim.methodType === "CASH"
              ? t("pendingTitleCash")
              : t("pendingTitle")}
          </Badge>
          <p role="status" className="text-sm leading-relaxed text-ink/70">
            {claim.methodType === "CASH"
              ? t("pendingDescCash")
              : privateClass
                ? t("pendingDescPrivate", { method: claim.methodLabel })
                : t("pendingDesc", { method: claim.methodLabel })}
          </p>
        </div>
      )}

      {/* Intento registrado: instrucciones + upload. */}
      {claim?.status === "AWAITING" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink/70">
            {t("awaitingHint", { method: claim.methodLabel })}
          </p>

          {activeMethod?.type === "TRANSFER" && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-elevated p-4">
              {TRANSFER_FIELDS.map((f) =>
                activeMethod.details[f.key] ? (
                  <div key={f.key} className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 text-sm text-ink/50">
                      {t(f.label)}
                    </span>
                    <span className="break-all font-mono text-sm text-ink/90">
                      {activeMethod.details[f.key]}
                    </span>
                  </div>
                ) : null,
              )}
              <div className="mt-1 flex items-center gap-2 border-t border-line pt-2">
                <span className="w-28 shrink-0 text-sm text-ink/50">
                  {t("fAmount")}
                </span>
                <span className="font-mono text-sm font-semibold text-neon">
                  {clp.format(planPrice)}
                </span>
                <button
                  type="button"
                  onClick={() => copyAll(activeMethod)}
                  className="ml-auto min-h-9 shrink-0 rounded-lg border border-neon/40 px-3 text-xs font-semibold text-neon hover:bg-neon/10"
                >
                  {copied === "all" ? t("copied") : t("copyAll")}
                </button>
              </div>
            </div>
          )}

          {activeMethod?.type === "PAYMENT_LINK" &&
            activeMethod.details.url && (
              <a
                href={activeMethod.details.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neon px-4 text-sm font-semibold text-on-accent"
              >
                {t("payLink")}
              </a>
            )}

          {activeMethod?.type === "CASH" &&
            activeMethod.details.instructions && (
              <p className="text-sm text-ink/70">
                {activeMethod.details.instructions}
              </p>
            )}

          {/* El método pudo haberse borrado: el intento sigue
              registrado y el upload sigue disponible. */}
          {!activeMethod && (
            <p className="text-sm text-ink/50">{t("methodGone")}</p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("fieldFile")}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-ink/70 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
            />
          </label>
        </div>
      )}

      {/* Selector de medio: pasarela o método de la academia. */}
      {!claim && (
        <div className="flex flex-col gap-2">
          {rejectedNote && (
            <p role="status" className="text-xs text-red-300/80">
              {t("rejectedBefore", { note: rejectedNote })}
            </p>
          )}
          <div
            role="radiogroup"
            aria-label={t("chooseMethod")}
            className="flex flex-col gap-2"
          >
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
                selected === null
                  ? "border-neon/60 bg-neon/10"
                  : "border-line bg-elevated"
              }`}
            >
              <input
                type="radio"
                name="payMethod"
                checked={selected === null}
                onChange={() => {
                  setSelected(null);
                  onBlockingChange(false);
                }}
                className="h-4 w-4 accent-neon"
              />
              {t("methodGateway")}
            </label>
            {methods.map((m) => (
              <label
                key={m.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
                  selected === m.id
                    ? "border-neon/60 bg-neon/10"
                    : "border-line bg-elevated"
                }`}
              >
                <input
                  type="radio"
                  name="payMethod"
                  checked={selected === m.id}
                  onChange={() => {
                    setSelected(m.id);
                    onBlockingChange(true);
                  }}
                  className="h-4 w-4 accent-neon"
                />
                {m.label}
                <span className="ml-auto text-xs text-ink/40">
                  {t(
                    m.type === "TRANSFER"
                      ? "typeTransfer"
                      : m.type === "PAYMENT_LINK"
                        ? "typeLink"
                        : "typeCash",
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error común a todas las ramas (selector, AWAITING, fallo de
          carga): antes solo se renderizaba dentro de !claim y el
          fallo de sendReceipt quedaba invisible. */}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}
      </Card>

      {/* CTAs de la acción SIEMPRE fuera del card, en la posición del
          "Pagar" de la pasarela (el checkout oculta ese botón cuando el
          panel está activo): continuar con el método elegido o enviar
          el comprobante del intento registrado. */}
      {!claim && selected && (
        <Button
          type="button"
          className="w-full"
          size="lg"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? <Spinner size="sm" /> : null}
          {t("continueMethod", {
            label: methods.find((m) => m.id === selected)?.label ?? "",
          })}
        </Button>
      )}
      {claim?.status === "AWAITING" && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={!file || busy}
            onClick={() => void sendReceipt()}
          >
            {busy ? <Spinner size="sm" /> : null}
            {busy ? t("sending") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void cancelIntent()}
          >
            {t("cancelIntent")}
          </Button>
        </div>
      )}
    </>
  );
}
