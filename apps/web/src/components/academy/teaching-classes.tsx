"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button } from "@/components/ui";
import { QuorumBar } from "./quorum-bar";
import {
  classDayFmt,
  type TeachingClass,
} from "./shared";

type LoadState = "loading" | "ready" | "unauth" | "forbidden" | "error";

/**
 * "Mis clases" del instructor — GET /classes/teaching (próximas ~30d,
 * cross-academia: el contrato trae academyName por ítem). Sin AcademyGate:
 * la lista es por persona, no por academia seleccionada. Cada card enlaza
 * al roster /academia/clases/[id].
 */
export function TeachingClasses() {
  const t = useTranslations("instructor");
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<TeachingClass[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/classes/teaching");
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const rows = (await res.json()) as TeachingClass[];
      // Defensivo: próximas primero por fecha+hora, igual que /clases.
      rows.sort((a, b) =>
        `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      );
      setClasses(rows);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <p role="status" className="text-sm text-white/60">
        {tc("loading")}
      </p>
    );
  }
  if (state === "unauth") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-white/70">{t("loginRequired")}</p>
        <Button href="/login">{tc("login")}</Button>
      </div>
    );
  }
  if (state === "forbidden") {
    return <p className="text-sm text-white/60">{t("forbidden")}</p>;
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!classes || classes.length === 0) {
    return <p className="text-sm text-white/50">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {classes.map((c) => {
        const reached = c.quorum > 0 && c.bookedCount >= c.quorum;
        return (
          <li key={c.id}>
            <Link
              href={`/academia/clases/${c.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-night-700 bg-night-900 p-4 transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold capitalize">
                  {classDayFmt.format(new Date(c.date))}
                </p>
                <p className="text-sm tabular-nums text-white/70">
                  {c.startTime}–{c.endTime}
                </p>
              </div>

              <div className="min-w-0">
                <p className="truncate font-medium">
                  {c.seriesName ?? c.academyName}
                </p>
                <p className="text-xs text-white/60">
                  {c.academyName}
                  {c.styleName ? ` · ${c.styleName}` : ""}
                  {c.levelName ? ` · ${c.levelName}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge variant={reached ? "neon" : "outline"}>
                  {t("quorum")}{" "}
                  {t("quorumLine", { booked: c.bookedCount, quorum: c.quorum })}
                </Badge>
                {c.waitlistCount > 0 && (
                  <span className="text-xs text-white/50">
                    {t("waitlist", { count: c.waitlistCount })}
                  </span>
                )}
              </div>
              <QuorumBar booked={c.bookedCount} quorum={c.quorum} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
