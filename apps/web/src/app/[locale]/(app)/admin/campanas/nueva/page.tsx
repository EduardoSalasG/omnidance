"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon, SkeletonCard } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import {
  CampaignForm,
  type Campaign,
} from "@/components/admin/campaign-form";
import { useRouter } from "@/i18n/navigation";

/**
 * /admin/campanas/nueva - crear (y editar via ?edit=<id>, spec
 * admin-console-crud-align): la campaña se compone en página dedicada,
 * nunca inline en el listado. `GET /admin/mail-campaigns/:id` precarga
 * la edición; al guardar vuelve al listado con aviso global.
 */
function CampaignFormPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const editId = useSearchParams().get("edit");

  const [initial, setInitial] = useState<Campaign | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "error" | "ready"
  >(editId ? "loading" : "ready");
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    if (!editId) return;
    setLoadState("loading");
    try {
      const res = await apiFetch(`/admin/mail-campaigns/${editId}`);
      if (!res.ok) {
        setLoadState("error");
        return;
      }
      setInitial((await res.json()) as Campaign);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [editId]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  function done() {
    router.push("/admin/campanas");
  }

  return (
    <>
      <ConsoleHeader
        backHref="/admin/campanas"
        backLabel={t("campaigns.title")}
      />

      {loadState === "loading" && <SkeletonCard lines={4} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {loadState === "ready" && (
        <CampaignForm
          initial={editId ? initial : null}
          onClose={done}
          onSaved={async () => {
            showActionNotice({ text: t("campaigns.saved") });
            done();
          }}
          onError={(msg) =>
            setNotice(msg ? { text: msg, error: true } : null)
          }
        />
      )}

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export default function AdminCampanaNuevaPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <AdminGate>
        <Suspense fallback={null}>
          <CampaignFormPage />
        </Suspense>
      </AdminGate>
    </main>
  );
}
