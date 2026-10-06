"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Spinner } from "@/components/ui";

type PaymentMethod = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH";
  label: string;
  details: Record<string, string>;
};

type MyClaim = {
  id: string;
  amount: number;
  methodLabel: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  plan: { name: string } | null;
};

type Props = {
  academyId: string;
  plans: { id: string; name: string; price: number }[];
};

const TRANSFER_FIELD_KEYS = {
  bank: "fBank",
  accountType: "fAccountType",
  accountNumber: "fAccountNumber",
  holder: "fHolder",
  rut: "fRut",
  email: "fEmail",
} as const;
const TRANSFER_FIELDS = Object.keys(TRANSFER_FIELD_KEYS) as (keyof typeof TRANSFER_FIELD_KEYS)[];

const statusStyle: Record<MyClaim["status"], { variant: "muted" | "neon" | "outline"; label: string; className?: string }> = {
  PENDING: { variant: "muted", label: "statusPending" },
  APPROVED: { variant: "neon", label: "statusApproved" },
  REJECTED: { variant: "outline", label: "statusRejected", className: "border-red-400/50 text-red-300" },
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});

/**
 * "Pagar a la academia" (spec academy-payment-claims): medios de pago
 * BYO publicados por el owner + subida del comprobante + estado de los
 * propios claims. Se renderiza solo si la academia tiene métodos
 * activos; sin métodos la ficha queda igual que antes (checkout Flow).
 */
export function AcademyPaySection({ academyId, plans }: Props) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [claims, setClaims] = useState<MyClaim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [planId, setPlanId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        apiFetch(`/academies/${academyId}/payment-methods`),
        apiFetch(`/academies/${academyId}/claims/mine`),
      ]);
      setMethods(m.ok ? await m.json() : []);
      setClaims(c.ok ? await c.json() : []);
    } finally {
      setLoaded(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(key: string, text: string) {
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function submit() {
    if (!file || !amount || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("receipt", file, file.name);
      fd.set("amount", amount);
      if (planId) fd.set("planId", planId);
      if (methodId) fd.set("methodId", methodId);
      if (note.trim()) fd.set("note", note.trim());
      const res = await apiFetch(`/academies/${academyId}/claims`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        setMsg(t("error"));
        return;
      }
      setMsg(t("sentOk"));
      setFile(null);
      setAmount("");
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (methods.length === 0 && claims.length === 0) return null;

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("title")}
      </h2>

      {/* Medios activos */}
      {methods.length > 0 && (
        <ul className="flex flex-col gap-3">
          {methods.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-night-700 bg-night-800 p-4"
            >
              <p className="text-sm font-semibold">{m.label}</p>
              {m.type === "TRANSFER" && (
                <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                  {TRANSFER_FIELDS.map((f) =>
                    m.details[f] ? (
                      <div key={f} className="flex items-center gap-2">
                        <dt className="w-28 shrink-0 text-white/50">
                          {t(TRANSFER_FIELD_KEYS[f])}
                        </dt>
                        <dd className="font-mono text-white/90">
                          {m.details[f]}
                        </dd>
                        <button
                          type="button"
                          onClick={() => void copy(`${m.id}-${f}`, m.details[f])}
                          className="ml-auto min-h-8 rounded-lg px-2 text-xs text-neon hover:bg-neon/10"
                        >
                          {copied === `${m.id}-${f}` ? t("copied") : t("copy")}
                        </button>
                      </div>
                    ) : null,
                  )}
                </dl>
              )}
              {m.type === "PAYMENT_LINK" && m.details.url && (
                <a
                  href={m.details.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-neon px-4 text-sm font-semibold text-night-950"
                >
                  {t("payLink")}
                </a>
              )}
              {m.type === "CASH" && m.details.instructions && (
                <p className="mt-1 text-sm text-white/70">
                  {m.details.instructions}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Subir comprobante */}
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-white/50">
          {t("uploadDesc")}
        </p>
        {plans.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/60">{t("fieldPlan")}</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="min-h-11 rounded-xl border border-night-700 bg-night-900 px-3 text-sm"
            >
              <option value="">{t("fieldPlanOther")}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {clp.format(p.price)}
                </option>
              ))}
            </select>
          </label>
        )}
        {methods.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/60">{t("fieldMethod")}</span>
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="min-h-11 rounded-xl border border-night-700 bg-night-900 px-3 text-sm"
            >
              <option value="">{t("fieldMethodOther")}</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/60">{t("fieldAmount")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 rounded-xl border border-night-700 bg-night-900 px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/60">{t("fieldNote")}</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            placeholder={t("fieldNotePh")}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-11 rounded-xl border border-night-700 bg-night-900 px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/60">{t("fieldFile")}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-white/70 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-night-700 file:px-4 file:text-sm file:text-white"
          />
        </label>
        {msg && (
          <p role="status" className="text-sm text-neon">
            {msg}
          </p>
        )}
        <Button
          onClick={() => void submit()}
          disabled={!file || !amount || busy}
        >
          {busy ? <Spinner /> : null}
          {busy ? t("sending") : t("submit")}
        </Button>
      </div>

      {/* Mis comprobantes */}
      {claims.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
            {t("myClaimsTitle")}
          </h3>
          <ul className="flex flex-col gap-2">
            {claims.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-night-700 px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {c.plan?.name ?? c.methodLabel}
                </span>
                <span className="text-white/50">
                  {clp.format(c.amount)} · {dayFmt.format(new Date(c.createdAt))}
                </span>
                <Badge
                  variant={statusStyle[c.status].variant}
                  className={`ml-auto ${statusStyle[c.status].className ?? ""}`}
                >
                  {t(statusStyle[c.status].label)}
                </Badge>
                {c.status === "REJECTED" && c.reviewNote && (
                  <p className="w-full text-xs text-red-300/80">
                    {c.reviewNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
