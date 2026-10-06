"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError } from "@/components/academy/shared";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";

// Consola de facturación (spec admin-billing-documents): emisión de la
// nota de cobro interna por liquidación (idempotente - candidates sin
// documento), listado con folio, descarga del PDF y anulación con
// motivo. El PDF se abre inline en otra pestaña (auth por cookie).

type Candidate = {
  id: string;
  actorType: string;
  actorId: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  net: number;
  status: string;
  chargeTotal: number;
  document: { id: string; folio: number; status: string } | null;
};

type BillingDoc = {
  id: string;
  folio: number;
  status: "ISSUED" | "VOID";
  actorType: string;
  receiverName: string;
  receiverRut: string | null;
  periodStart: string;
  periodEnd: string;
  totalClp: number;
  currency: string;
  issuedAt: string;
  voidReason: string | null;
  receiver: { id: string; name: string; email: string | null };
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const dmy = (iso: string) => dateFmt.format(new Date(iso));

export default function AdminFacturacionPage() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <BillingPanel />
      </AdminGate>
    </main>
  );
}

function BillingPanel() {
  const t = useTranslations("admin.billing");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [docs, setDocs] = useState<BillingDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [rc, rd] = await Promise.all([
      apiFetch("/admin/billing/candidates"),
      apiFetch("/admin/billing"),
    ]);
    if (!rc.ok || !rd.ok) {
      setError(await readError(rc.ok ? rd : rc));
      setCandidates([]);
      setDocs([]);
      return;
    }
    setCandidates(await rc.json());
    setDocs(await rd.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(payoutId: string) {
    setGenerating(payoutId);
    setError(null);
    try {
      const res = await apiFetch("/admin/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      });
      if (!res.ok) setError(await readError(res));
      else await load();
    } finally {
      setGenerating(null);
    }
  }

  async function submitVoid(id: string) {
    if (!voidReason.trim()) return;
    setVoidBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/billing/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      if (!res.ok) setError(await readError(res));
      else {
        setVoidingId(null);
        setVoidReason("");
        await load();
      }
    } finally {
      setVoidBusy(false);
    }
  }

  const pending = candidates?.filter((c) => !c.document) ?? [];

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-white/60">{t("desc")}</p>
        {error && (
          <Card className="border-red-500/40 p-3 text-sm text-red-300">
            {error}
          </Card>
        )}
      </section>

      {/* ── Emitir desde liquidaciones ─────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white/80">
          {t("candidatesTitle")}
        </h2>
        {candidates === null ? (
          <SkeletonList items={3} />
        ) : pending.length === 0 ? (
          <Card className="p-4 text-sm text-white/60">
            {t("candidatesEmpty")}
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((c) => (
              <Card key={c.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t(`actor.${c.actorType}`)} ·{" "}
                      <span className="text-white/50">
                        {c.actorId.slice(0, 8)}
                      </span>
                    </p>
                    <p className="text-xs text-white/50">
                      {dmy(c.periodStart)} – {dmy(c.periodEnd)} ·{" "}
                      {t("charges", { amount: clp.format(c.chargeTotal) })}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => generate(c.id)}
                    disabled={generating === c.id}
                  >
                    {generating === c.id ? (
                      <Spinner size="sm" />
                    ) : (
                      t("generate")
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* ── Documentos emitidos ────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white/80">
          {t("docsTitle")}
        </h2>
        {docs === null ? (
          <SkeletonList items={3} />
        ) : docs.length === 0 ? (
          <Card className="p-4 text-sm text-white/60">{t("docsEmpty")}</Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <Card key={d.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {t("folio", { n: d.folio })}
                      <Badge
                        variant={d.status === "ISSUED" ? "neon" : "outline"}
                      >
                        {t(`status.${d.status}`)}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-white/60">
                      {d.receiverName}
                      {d.receiverRut ? ` · ${d.receiverRut}` : ""}
                    </p>
                    <p className="text-xs text-white/50">
                      {dmy(d.periodStart)} – {dmy(d.periodEnd)} ·{" "}
                      {clp.format(d.totalClp)}
                    </p>
                    {d.status === "VOID" && d.voidReason && (
                      <p className="text-xs text-red-300/80">
                        {t("voidedReason", { reason: d.voidReason })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <a
                      href={`/api/admin/billing/${d.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-300 underline"
                    >
                      {t("openPdf")}
                    </a>
                    {d.status === "ISSUED" && (
                      <button
                        type="button"
                        className="text-xs text-red-300 underline"
                        onClick={() => {
                          setVoidingId(voidingId === d.id ? null : d.id);
                          setVoidReason("");
                        }}
                      >
                        {t("void")}
                      </button>
                    )}
                  </div>
                </div>
                {voidingId === d.id && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitVoid(d.id);
                    }}
                  >
                    <input
                      className={`${inputCls} flex-1 text-xs`}
                      placeholder={t("voidReasonPlaceholder")}
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      required
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      disabled={voidBusy || !voidReason.trim()}
                    >
                      {voidBusy ? <Spinner size="sm" /> : t("voidConfirm")}
                    </Button>
                  </form>
                )}
              </Card>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
