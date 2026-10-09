"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { inputCls } from "@/components/producer/shared";

type GuestListEntry = {
  id: string;
  personId: string;
  status: string; // "PENDING" | "ARRIVED"
  person: { personId: string; name: string; photoUrl: string | null };
};

type GuestListDetail = {
  id: string;
  eventId: string;
  ownerId: string;
  label: string | null;
  specialPrice: number | null;
  event: { id: string; name: string } | null;
  owner: { personId: string; name: string; photoUrl: string | null };
  entries: GuestListEntry[];
};

/**
 * /productor/listas/[id] - ficha de la lista de invitados: invitados,
 * alta de persona y emisión del EntryPass LIST por entrada. Las mutaciones
 * de la lista viven acá - el listado solo navega.
 */
function GuestListDetail() {
  const t = useTranslations("producer");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const tac = useTranslations("academy");
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [list, setList] = useState<GuestListDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);
  const [personDraft, setPersonDraft] = useState("");
  const [entrySaving, setEntrySaving] = useState(false);
  const [passBusyId, setPassBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<"passIssued" | "addError" | "error" | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await apiFetch(`/guest-lists/${id}`).catch(() => null);
    if (!res?.ok) {
      setLoadState("error");
      return;
    }
    setList((await res.json()) as GuestListDetail);
    setLoadState("ready");
  }, [id]);

  useEffect(() => {
    setLoadState("loading");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, nonce]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    const personId = personDraft.trim();
    if (!personId || entrySaving) return;
    setEntrySaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`/guest-lists/${id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!res.ok) {
        // 404 persona no encontrada / 409 duplicado.
        setMsg("addError");
        return;
      }
      setPersonDraft("");
      await load();
    } catch {
      setMsg("addError");
    } finally {
      setEntrySaving(false);
    }
  }

  async function issuePass(entryId: string) {
    setPassBusyId(entryId);
    setMsg(null);
    try {
      const res = await apiFetch(`/guest-lists/${id}/entries/${entryId}/pass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setMsg(res.ok ? "passIssued" : "error");
      await load();
    } catch {
      setMsg("error");
    } finally {
      setPassBusyId(null);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref="/productor/listas"
        backLabel={t("guestLists")}
      />

      {loadState === "loading" && <SkeletonList items={2} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("listDetail.notFound")}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {loadState === "ready" && list && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {list.label ?? list.owner.name}
              </h2>
              {list.specialPrice !== null && (
                <Badge variant="neon">
                  <PriceTag amount={list.specialPrice} />
                </Badge>
              )}
            </div>
            <Card className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink/50">{t("event")}</dt>
                  <dd>
                    {list.event ? (
                      <Link
                        href={`/productor/eventos/${list.event.id}`}
                        className="text-neon underline-offset-4 hover:underline"
                      >
                        {list.event.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {t("listDetail.owner")}
                  </dt>
                  <dd className="font-medium">{list.owner.name}</dd>
                </div>
                {list.specialPrice !== null && (
                  <div>
                    <dt className="text-xs text-ink/50">
                      {t("listDetail.specialPrice")}
                    </dt>
                    <dd>
                      <PriceTag amount={list.specialPrice} />
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                {t("listDetail.entries")}
              </h2>
              <span className="text-xs tabular-nums text-ink/50">
                {t("listDetail.entriesCount", {
                  count: list.entries.length,
                })}
              </span>
            </div>

            {list.entries.length === 0 && (
              <Card className="py-8 text-center">
                <p role="status" className="text-ink/70">
                  {t("listDetail.emptyEntries")}
                </p>
              </Card>
            )}

            {list.entries.length > 0 && (
              <Card padded={false}>
                <ul className="flex flex-col divide-y divide-line">
                  {list.entries.map((en) => (
                    <li
                      key={en.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {en.person.name}
                      </span>
                      <Badge
                        variant={en.status === "ARRIVED" ? "neon" : "muted"}
                      >
                        {ta.has(`status.${en.status}`)
                          ? ta(`status.${en.status}`)
                          : en.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void issuePass(en.id)}
                        disabled={passBusyId === en.id}
                      >
                        {passBusyId === en.id ? (
                          <Spinner size="sm" />
                        ) : null}
                        {t("listDetail.issuePass")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <form className="flex gap-2" onSubmit={addEntry}>
              <input
                type="text"
                autoComplete="off"
                placeholder={tac("personId")}
                aria-label={`${t("addPerson")}: ${list.label ?? list.owner.name}`}
                value={personDraft}
                onChange={(e) => setPersonDraft(e.target.value)}
                className={`${inputCls} min-h-11 flex-1 py-2 text-sm`}
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!personDraft.trim() || entrySaving}
              >
                {entrySaving ? <Spinner size="sm" /> : null}
                {t("addPerson")}
              </Button>
            </form>
            {msg && (
              <p
                role={msg === "passIssued" ? "status" : "alert"}
                className={`text-sm ${
                  msg === "passIssued" ? "text-neon" : "text-red-400"
                }`}
              >
                {msg === "passIssued"
                  ? t("listDetail.passIssued")
                  : msg === "addError"
                    ? t("listDetail.addError")
                    : tc("error")}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function GuestListDetailPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <GuestListDetail />
      </ProducerGate>
    </main>
  );
}
