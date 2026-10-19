"use client";

import { useCallback, useEffect, useState, use } from "react";

import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ClockIcon,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { getDateFmt } from "@/lib/intl";
import { Link } from "@/i18n/navigation";

const fmtDate = (iso: string | Date, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

type ClassDetail = {
  cls: {
    id: string;
    date: string;
    cancelled: boolean;
    startTime: string;
    endTime: string;
    title: string;
    types: string[];
    capacity: number | null;
    bookedCount: number;
    checkedIn: number;
    instructors: { personId: string; name: string | null }[];
  };
  academyName: string;
  bookings: {
    personId: string;
    name: string | null;
    status: string;
    createdAt: string;
  }[];
  attendances: {
    personId: string;
    name: string | null;
    checkedAt: string;
  }[];
};

const BOOKING_VARIANT: Record<string, BadgeVariant> = {
  BOOKED: "neon",
  WAITLIST: "outline",
  CANCELLED: "muted",
};

export default function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id, classId } = use(params);
  return (
    <AdminGate>
      <Panel academyId={id} classId={classId} />
    </AdminGate>
  );
}

function Panel({ academyId, classId }: { academyId: string; classId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [d, setD] = useState<ClassDetail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/admin/academies/${academyId}/clases/${classId}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setD(await res.json());
    } catch {
      setError(true);
    }
  }, [academyId, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mainCls =
    "mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8";

  if (error) {
    return (
      <main className={mainCls}>
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("academies.error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      </main>
    );
  }
  if (!d)
    return (
      <main className={mainCls}>
        <SkeletonList items={3} lines={2} />
      </main>
    );

  const { cls: c } = d;
  const infoRow = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <dt className="text-xs text-ink/50">{label}</dt>
        <dd className="truncate text-sm">{value}</dd>
      </div>
    ) : null;

  return (
    <main className={mainCls}>
      <ConsoleHeader
        backHref={`/admin/academias/${academyId}`}
        backLabel={d.academyName}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {c.title}
        </h1>
        {c.cancelled && (
          <Badge variant="live">{t("academies.class.cancelled")}</Badge>
        )}
        {c.types.map((x) => (
          <Badge key={x} variant="outline">
            {x}
          </Badge>
        ))}
      </div>

      {/* Datos de la clase */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("academies.class.data")}</h2>
        <Card className="p-4">
          <dl className="divide-y divide-line">
            {infoRow(t("academies.class.date"), fmtDate(c.date, locale))}
            {infoRow(
              t("academies.class.time"),
              `${c.startTime} – ${c.endTime}`,
            )}
            {infoRow(
              t("academies.class.instructors"),
              c.instructors.length > 0
                ? c.instructors
                    .map((i) => i.name ?? i.personId)
                    .join(", ")
                : null,
            )}
            {infoRow(
              t("academies.class.capacity"),
              c.capacity != null ? String(c.capacity) : null,
            )}
            {infoRow(
              t("academies.class.booked"),
              t("academies.class.bookedCount", { count: c.bookedCount }),
            )}
            {infoRow(
              t("academies.class.checkedIn"),
              t("academies.class.checkedInCount", { count: c.checkedIn }),
            )}
          </dl>
        </Card>
      </section>

      {/* Reservas */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.class.bookings")}
        </h2>
        {d.bookings.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("academies.class.noBookings")}
          </p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.bookings.map((b) => (
              <Link
                key={b.personId}
                href={`/admin/usuarios/${b.personId}`}
                className="flex min-h-11 items-center gap-2 px-4 hover:bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {b.name ?? b.personId}
                </span>
                <Badge variant={BOOKING_VARIANT[b.status] ?? "muted"}>
                  {t(`academies.class.statuses.${b.status}`)}
                </Badge>
                <span className="text-xs tabular-nums text-ink/50">
                  {fmtDate(b.createdAt, locale)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Check-ins */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.class.checkins")}
        </h2>
        {d.attendances.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("academies.class.noCheckins")}
          </p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.attendances.map((a) => (
              <Link
                key={a.personId}
                href={`/admin/usuarios/${a.personId}`}
                className="flex min-h-11 items-center gap-2 px-4 hover:bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {a.name ?? a.personId}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink/50">
                  <ClockIcon className="h-3 w-3" />
                  {fmtDate(a.checkedAt, locale)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </main>
  );
}
