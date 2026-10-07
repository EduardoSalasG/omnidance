"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import {
  OwnMethodDetails,
  type OwnMethod,
} from "./own-method-picker";

type Claim = {
  id: string;
  methodLabel: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
};

const POLL_INTERVAL_MS = 3_000;

/**
 * Orden por método propio (spec producer-own-methods): la orden quedó
 * MANUAL PENDING - acá el comprador ve las instrucciones del método,
 * sube el comprobante (POST /payments/:id/claims multipart) y espera la
 * validación del productor. Poll de /payments/:id → PAID dispara
 * `onPaid` (el caller muestra su pantalla de éxito).
 */
export function OwnMethodClaim({
  paymentId,
  method,
  onPaid,
}: {
  paymentId: string;
  method: OwnMethod;
  onPaid: () => void;
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadClaims = useCallback(async () => {
    const res = await apiFetch(`/payments/${paymentId}/claims`).catch(
      () => null,
    );
    if (res?.ok) {
      const data = (await res.json()) as { claims: Claim[] };
      setClaims(data.claims);
    }
  }, [paymentId]);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  // Poll de la orden: al aprobar el productor el settle la deja PAID.
  useEffect(() => {
    const interval = setInterval(() => {
      void apiFetch(`/payments/${paymentId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const payment = (await res.json()) as { status: string };
          if (payment.status === "PAID") onPaid();
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paymentId, onPaid]);

  const lastClaim = claims[0] ?? null;
  const hasPending = lastClaim?.status === "PENDING";

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("receipt", file, file.name);
      fd.set("methodId", method.id);
      if (note.trim()) fd.set("note", note.trim());
      const res = await apiFetch(`/payments/${paymentId}/claims`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        setMsg({ ok: false, text: tc("error") });
        return;
      }
      setMsg({ ok: true, text: t("claimSent") });
      setFile(null);
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      await loadClaims();
    } catch {
      setMsg({ ok: false, text: tc("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <Badge variant="muted">{t("ownMethodPendingTitle")}</Badge>
        <h2 className="mt-2 text-base font-semibold">{method.label}</h2>
        <p className="mt-1 text-sm text-ink/60">
          {t("ownMethodPendingDesc")}
        </p>
      </div>

      <OwnMethodDetails method={method} />

      {lastClaim?.status === "REJECTED" && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm"
        >
          <p className="font-medium text-red-300">{t("claimRejected")}</p>
          {lastClaim.reviewNote && (
            <p className="mt-1 text-red-300/80">{lastClaim.reviewNote}</p>
          )}
        </div>
      )}

      {hasPending ? (
        <p role="status" className="animate-pulse text-sm text-ink/70">
          {t("claimPending")}
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("claimNote")}</span>
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("claimFile")}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-ink/70 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-sm file:text-ink"
            />
          </label>
          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={`text-sm ${msg.ok ? "text-neon" : "text-red-400"}`}
            >
              {msg.text}
            </p>
          )}
          <Button onClick={() => void submit()} disabled={!file || busy}>
            {busy && <Spinner size="sm" />}
            {busy ? t("claimSending") : t("claimSubmit")}
          </Button>
        </div>
      )}
    </Card>
  );
}
