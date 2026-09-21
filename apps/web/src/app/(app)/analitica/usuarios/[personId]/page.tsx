"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PillTabs } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";

// GET /admin/users/:personId/detail → person + historial de roles.
type RoleEntry = { id: string; role: string; status: string; createdAt: string };
type PersonDetail = {
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
  };
  roles: RoleEntry[];
};

// Shapes de GET /admin/users/:personId/analytics?role=X (sections por lente).
type NamedCount = { name: string; count: number };
type EventLite = { id: string; name: string; startsAt: string };

type DancerSocial = {
  totalSpentClp: number;
  monthSpentClp: number;
  monthlyAvgClp: number;
  lastEvent: EventLite | null;
  favoriteEvents: { eventId: string; name: string; attendances: number }[];
  avgCheckinHour: number | null;
  dancesCount: number;
  seasonPoints: number;
  rank: number | null;
  badges: { key: string; name: string }[];
};
type DancerAcademy = {
  activeEnrollments: {
    academy: { id: string; name: string };
    plan: { name: string; price: number; type: string } | null;
    status: string;
  }[];
  classesTaken: number;
  classesUpcoming: number;
  currentMonthlyClp: number;
  totalPaidClp: number;
  byAcademy: NamedCount[];
  byStyle: NamedCount[];
  byGenre: { genre: string; count: number }[];
};
type ProducerSections = {
  eventsTotal: number;
  eventsUpcoming: number;
  grossAllClp: number;
  grossMonthClp: number;
  ticketsSold: number;
  avgOccupancyPct: number | null;
  topEvents: { id: string; name: string; grossClp: number }[];
};
type StaffSections = {
  producers: { id: string; name: string; shifts: number }[];
  eventsWorked: number;
  upcomingShifts: number;
};
type InstructorSections = {
  academies: { id: string; name: string }[];
  classesTaught: number;
  classesUpcoming: number;
  avgFillPct: number | null;
};
type DjSections = {
  gigsTotal: number;
  gigsUpcoming: number;
  events: EventLite[];
};
type VenueManagerSections = {
  venues: { id: string; name: string }[];
  rentalsByStatus: Record<string, number>;
};
type AcademyOwnerSections = {
  academies: {
    id: string;
    name: string;
    students: number;
    attendance30d: number;
    classes30d: number;
  }[];
};
type MetaSections = {
  meta: { accountAgeDays: number; roleHistory: RoleEntry[] };
};

type BootPhase = "loading" | "ready" | "notfound" | "error";
type SectionPhase = "loading" | "ready" | "notHeld" | "error";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "23.4" → "23:24" — hora decimal del avgCheckinHour. */
function fmtHour(v: number): string {
  let h = Math.floor(v);
  let m = Math.round((v - h) * 60);
  if (m === 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Tile KPI — mismo patrón que los tiles de /analitica (neon + label). */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
      <span className="block text-2xl font-bold tabular-nums text-neon">
        {value}
      </span>
      <span className="text-xs text-white/50">{label}</span>
    </li>
  );
}

function KpiGrid({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {items.map((k) => (
        <Kpi key={k.label} label={k.label} value={k.value} />
      ))}
    </ul>
  );
}

/** Fila label → valor dentro de una Card de detalle. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-white/60">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{value}</span>
    </li>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {title}
      </h3>
      <ul className="mt-1 flex flex-col divide-y divide-night-700">
        {children}
      </ul>
    </Card>
  );
}

/** Mini-lista name + count (byAcademy / byStyle / byGenre / producers). */
function CountList({ rows }: { rows: { label: string; count: number }[] }) {
  return (
    <>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={num.format(r.count)} />
      ))}
    </>
  );
}

/**
 * /analitica/usuarios/[personId] — ficha de analítica por lente de rol.
 * Boot: GET /admin/users/:personId/detail (person + roles); las pills
 * listan los roles APPROVED y cada selección refetchea
 * /admin/users/:personId/analytics?role=X.
 */
export default function AnaliticaUsuarioPage({
  params,
}: {
  params: { personId: string };
}) {
  const t = useTranslations("analytics");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader
        backHref="/analitica/usuarios"
        backLabel={t("userSearch.title")}
      />
      <AdminGate>
        <UserPanel personId={params.personId} />
      </AdminGate>
    </main>
  );
}

function UserPanel({ personId }: { personId: string }) {
  const t = useTranslations("analytics");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<BootPhase>("loading");
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  const [role, setRole] = useState<string | null>(null);
  const [sectionPhase, setSectionPhase] = useState<SectionPhase>("loading");
  const [sections, setSections] = useState<Record<string, unknown> | null>(
    null,
  );

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;

  const boot = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch(`/admin/users/${personId}/detail`);
      if (res.status === 404) return setPhase("notfound");
      if (!res.ok) return setPhase("error");
      const data = (await res.json()) as PersonDetail;
      setDetail(data);
      const approved = [
        ...new Set(
          data.roles
            .filter((r) => r.status === "APPROVED")
            .map((r) => r.role),
        ),
      ];
      setRole((prev) =>
        prev && approved.includes(prev) ? prev : (approved[0] ?? null),
      );
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [personId]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Secciones del lente activo — 400 ROLE_NOT_HELD (rol revocado entre el
  // detail y este fetch) se muestra como "sin actividad" en vez de error.
  const loadSections = useCallback(
    async (r: string) => {
      setSectionPhase("loading");
      setSections(null);
      try {
        const res = await apiFetch(
          `/admin/users/${personId}/analytics?role=${encodeURIComponent(r)}`,
        );
        if (res.status === 400) return setSectionPhase("notHeld");
        if (!res.ok) return setSectionPhase("error");
        const data = (await res.json()) as {
          role: string;
          sections: Record<string, unknown>;
        };
        setSections(data.sections);
        setSectionPhase("ready");
      } catch {
        setSectionPhase("error");
      }
    },
    [personId],
  );

  useEffect(() => {
    if (role) void loadSections(role);
  }, [role, loadSections]);

  if (phase === "loading") return <PageLoading />;

  if (phase === "notfound") {
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-white/70">{t("user.notFound")}</p>
      </Card>
    );
  }

  if (phase === "error" || !detail) {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-white/70">{tc("error")}</p>
        <Button variant="secondary" size="sm" onClick={() => void boot()}>
          {tc("retry")}
        </Button>
      </Card>
    );
  }

  const approvedRoles = [
    ...new Set(
      detail.roles.filter((r) => r.status === "APPROVED").map((r) => r.role),
    ),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-xl font-semibold">{detail.person.name}</h2>
        {(detail.person.email ?? detail.person.phone) && (
          <p className="truncate text-sm text-white/60">
            {detail.person.email ?? detail.person.phone}
          </p>
        )}
      </header>

      {approvedRoles.length > 0 && (
        <section aria-label={t("user.roleLens")} className="flex flex-col gap-2">
          <span className="text-sm text-white/50">{t("user.roleLens")}</span>
          <PillTabs
            ariaLabel={t("user.roleLens")}
            active={role ?? ""}
            onSelect={setRole}
            items={approvedRoles.map((r) => ({ key: r, label: roleLabel(r) }))}
          />
        </section>
      )}

      {approvedRoles.length === 0 && (
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("user.empty")}</p>
        </Card>
      )}

      {sectionPhase === "loading" && role && <PageLoading />}

      {sectionPhase === "error" && (
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{tc("error")}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => role && void loadSections(role)}
          >
            {tc("retry")}
          </Button>
        </Card>
      )}

      {(sectionPhase === "notHeld" ||
        (sectionPhase === "ready" &&
          sections !== null &&
          role !== null &&
          isEmpty(role, sections))) && (
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("user.empty")}</p>
        </Card>
      )}

      {sectionPhase === "ready" && sections && role && (
        <RoleSections role={role} sections={sections} />
      )}
    </div>
  );
}

// ── Vacío por lente ────────────────────────────────────────────────────

function isEmpty(role: string, s: Record<string, unknown>): boolean {
  switch (role) {
    case "DANCER": {
      const social = s.social as DancerSocial | undefined;
      const academy = s.academy as DancerAcademy | undefined;
      const socialEmpty =
        !social ||
        (!social.totalSpentClp &&
          !social.monthSpentClp &&
          !social.lastEvent &&
          !social.favoriteEvents.length &&
          social.avgCheckinHour == null &&
          !social.dancesCount &&
          !social.seasonPoints &&
          social.rank == null &&
          !social.badges.length);
      const academyEmpty =
        !academy ||
        (!academy.activeEnrollments.length &&
          !academy.classesTaken &&
          !academy.classesUpcoming &&
          !academy.currentMonthlyClp &&
          !academy.totalPaidClp &&
          !academy.byAcademy.length &&
          !academy.byStyle.length &&
          !academy.byGenre.length);
      return socialEmpty && academyEmpty;
    }
    case "PRODUCER":
      return (s as unknown as ProducerSections).eventsTotal === 0;
    case "STAFF": {
      const d = s as unknown as StaffSections;
      return (
        d.producers.length === 0 && d.eventsWorked === 0 && d.upcomingShifts === 0
      );
    }
    case "INSTRUCTOR": {
      const d = s as unknown as InstructorSections;
      return (
        d.academies.length === 0 &&
        d.classesTaught === 0 &&
        d.classesUpcoming === 0
      );
    }
    case "DJ":
      return (s as unknown as DjSections).gigsTotal === 0;
    case "VENUE_MANAGER":
      return (s as unknown as VenueManagerSections).venues.length === 0;
    case "ACADEMY_OWNER":
      return (s as unknown as AcademyOwnerSections).academies.length === 0;
    default:
      // meta (accountAgeDays + roleHistory) siempre tiene contenido.
      return false;
  }
}

// ── Contenido por lente ────────────────────────────────────────────────

function RoleSections({
  role,
  sections,
}: {
  role: string;
  sections: Record<string, unknown>;
}) {
  const t = useTranslations("analytics");
  const tp = useTranslations("profile");
  const tac = useTranslations("academy");
  const tg = useTranslations("adminCatalogs");

  const f = (k: string) => t(`user.fields.${k}`);
  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const statusLabel = (s: string) =>
    t.has(`statusLabels.${s}`) ? t(`statusLabels.${s}`) : s;
  const enrollLabel = (s: string) =>
    tac.has(`status.${s}`) ? tac(`status.${s}`) : s;
  const genreLabel = (g: string) =>
    tg.has(`genres.${g}`) ? tg(`genres.${g}`) : g;

  switch (role) {
    case "DANCER": {
      const social = sections.social as DancerSocial | undefined;
      const academy = sections.academy as DancerAcademy | undefined;
      return (
        <>
          {social && (
            <section
              aria-label={t("user.sections.social")}
              className="flex flex-col gap-3"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("user.sections.social")}
              </h2>
              <KpiGrid
                items={[
                  { label: f("totalSpent"), value: clp.format(social.totalSpentClp) },
                  { label: f("monthSpent"), value: clp.format(social.monthSpentClp) },
                  { label: f("monthlyAvg"), value: clp.format(social.monthlyAvgClp) },
                  { label: f("dances"), value: num.format(social.dancesCount) },
                  { label: f("seasonPoints"), value: num.format(social.seasonPoints) },
                  {
                    label: f("rank"),
                    value: social.rank != null ? `#${num.format(social.rank)}` : "—",
                  },
                ]}
              />
              {(social.lastEvent || social.avgCheckinHour != null) && (
                <Card>
                  <ul className="flex flex-col divide-y divide-night-700">
                    {social.lastEvent && (
                      <Row
                        label={f("lastEvent")}
                        value={`${social.lastEvent.name} · ${dateTimeFmt.format(new Date(social.lastEvent.startsAt))}`}
                      />
                    )}
                    {social.avgCheckinHour != null && (
                      <Row
                        label={f("avgCheckinHour")}
                        value={fmtHour(social.avgCheckinHour)}
                      />
                    )}
                  </ul>
                </Card>
              )}
              {social.badges.length > 0 && (
                <section aria-label={f("badges")} className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {f("badges")}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {social.badges.map((b) => (
                      <li key={b.key}>
                        <Badge variant="neon">{b.name}</Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {social.favoriteEvents.length > 0 && (
                <SectionCard title={f("favoriteEvents")}>
                  {social.favoriteEvents.map((e) => (
                    <Row
                      key={e.eventId}
                      label={e.name}
                      value={t("user.fields.attendances", {
                        count: e.attendances,
                      })}
                    />
                  ))}
                </SectionCard>
              )}
            </section>
          )}

          {academy && (
            <section
              aria-label={t("user.sections.academy")}
              className="flex flex-col gap-3"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("user.sections.academy")}
              </h2>
              <KpiGrid
                items={[
                  { label: f("currentMonthly"), value: clp.format(academy.currentMonthlyClp) },
                  { label: f("totalPaid"), value: clp.format(academy.totalPaidClp) },
                  { label: f("classesTaken"), value: num.format(academy.classesTaken) },
                  { label: f("classesUpcoming"), value: num.format(academy.classesUpcoming) },
                ]}
              />
              {academy.activeEnrollments.length > 0 && (
                <SectionCard title={f("activeEnrollments")}>
                  {academy.activeEnrollments.map((e, i) => (
                    <li
                      key={`${e.academy.id}-${i}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {e.academy.name}
                        </p>
                        {e.plan && (
                          <p className="truncate text-xs text-white/50">
                            {e.plan.name} · {clp.format(e.plan.price)}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">{enrollLabel(e.status)}</Badge>
                    </li>
                  ))}
                </SectionCard>
              )}
              {academy.byAcademy.length > 0 && (
                <SectionCard title={f("byAcademy")}>
                  <CountList
                    rows={academy.byAcademy.map((r) => ({
                      label: r.name,
                      count: r.count,
                    }))}
                  />
                </SectionCard>
              )}
              {academy.byStyle.length > 0 && (
                <SectionCard title={f("byStyle")}>
                  <CountList
                    rows={academy.byStyle.map((r) => ({
                      label: r.name,
                      count: r.count,
                    }))}
                  />
                </SectionCard>
              )}
              {academy.byGenre.length > 0 && (
                <SectionCard title={f("byGenre")}>
                  <CountList
                    rows={academy.byGenre.map((r) => ({
                      label: genreLabel(r.genre),
                      count: r.count,
                    }))}
                  />
                </SectionCard>
              )}
            </section>
          )}
        </>
      );
    }

    case "PRODUCER": {
      const d = sections as unknown as ProducerSections;
      return (
        <>
          <KpiGrid
            items={[
              { label: f("eventsTotal"), value: num.format(d.eventsTotal) },
              { label: f("eventsUpcoming"), value: num.format(d.eventsUpcoming) },
              { label: f("grossAll"), value: clp.format(d.grossAllClp) },
              { label: f("grossMonth"), value: clp.format(d.grossMonthClp) },
              { label: f("ticketsSold"), value: num.format(d.ticketsSold) },
              {
                label: f("avgOccupancy"),
                value:
                  d.avgOccupancyPct != null
                    ? `${num.format(d.avgOccupancyPct)}%`
                    : "—",
              },
            ]}
          />
          {d.topEvents.length > 0 && (
            <SectionCard title={f("topEvents")}>
              {d.topEvents.map((e) => (
                <Row key={e.id} label={e.name} value={clp.format(e.grossClp)} />
              ))}
            </SectionCard>
          )}
        </>
      );
    }

    case "STAFF": {
      const d = sections as unknown as StaffSections;
      return (
        <>
          <KpiGrid
            items={[
              { label: f("eventsWorked"), value: num.format(d.eventsWorked) },
              { label: f("upcomingShifts"), value: num.format(d.upcomingShifts) },
            ]}
          />
          {d.producers.length > 0 && (
            <SectionCard title={f("producers")}>
              {d.producers.map((p) => (
                <Row
                  key={p.id}
                  label={p.name}
                  value={`${num.format(p.shifts)} ${f("shifts")}`}
                />
              ))}
            </SectionCard>
          )}
        </>
      );
    }

    case "INSTRUCTOR": {
      const d = sections as unknown as InstructorSections;
      return (
        <>
          <KpiGrid
            items={[
              { label: f("classesTaught"), value: num.format(d.classesTaught) },
              { label: f("classesUpcoming"), value: num.format(d.classesUpcoming) },
              {
                label: f("avgFill"),
                value:
                  d.avgFillPct != null ? `${num.format(d.avgFillPct)}%` : "—",
              },
            ]}
          />
          {d.academies.length > 0 && (
            <SectionCard title={f("academies")}>
              {d.academies.map((a) => (
                <Row key={a.id} label={a.name} value="" />
              ))}
            </SectionCard>
          )}
        </>
      );
    }

    case "DJ": {
      const d = sections as unknown as DjSections;
      return (
        <>
          <KpiGrid
            items={[
              { label: f("gigsTotal"), value: num.format(d.gigsTotal) },
              { label: f("gigsUpcoming"), value: num.format(d.gigsUpcoming) },
            ]}
          />
          {d.events.length > 0 && (
            <SectionCard title={f("gigEvents")}>
              {d.events.map((e) => (
                <Row
                  key={e.id}
                  label={e.name}
                  value={dateTimeFmt.format(new Date(e.startsAt))}
                />
              ))}
            </SectionCard>
          )}
        </>
      );
    }

    case "VENUE_MANAGER": {
      const d = sections as unknown as VenueManagerSections;
      const rentalEntries = Object.entries(d.rentalsByStatus).filter(
        ([, n]) => n > 0,
      );
      return (
        <>
          {d.venues.length > 0 && (
            <SectionCard title={f("venues")}>
              {d.venues.map((v) => (
                <Row key={v.id} label={v.name} value="" />
              ))}
            </SectionCard>
          )}
          {rentalEntries.length > 0 && (
            <SectionCard title={f("rentalsByStatus")}>
              {rentalEntries.map(([status, count]) => (
                <Row
                  key={status}
                  label={statusLabel(status)}
                  value={num.format(count)}
                />
              ))}
            </SectionCard>
          )}
        </>
      );
    }

    case "ACADEMY_OWNER": {
      const d = sections as unknown as AcademyOwnerSections;
      return (
        <section
          aria-label={f("academies")}
          className="flex flex-col gap-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {f("academies")}
          </h2>
          <ul className="flex flex-col gap-3">
            {d.academies.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-night-700 bg-night-900 p-4"
              >
                <p className="truncate text-sm font-semibold">{a.name}</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="flex flex-col">
                    <span className="text-base font-semibold tabular-nums">
                      {num.format(a.students)}
                    </span>
                    <span className="text-xs text-white/50">
                      {f("students")}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold tabular-nums">
                      {num.format(a.attendance30d)}
                    </span>
                    <span className="text-xs text-white/50">
                      {f("attendance30d")}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold tabular-nums">
                      {num.format(a.classes30d)}
                    </span>
                    <span className="text-xs text-white/50">
                      {f("classes30d")}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    default: {
      // SUPPORT/ADMIN/roles custom → meta de cuenta.
      const meta = (sections as unknown as MetaSections).meta;
      if (!meta) return null;
      return (
        <section
          aria-label={t("user.sections.overview")}
          className="flex flex-col gap-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("user.sections.overview")}
          </h2>
          <Card>
            <p className="text-sm text-white/70">
              {t("user.fields.accountAge", { days: meta.accountAgeDays })}
            </p>
          </Card>
          {meta.roleHistory.length > 0 && (
            <SectionCard title={f("roleHistory")}>
              {meta.roleHistory.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {roleLabel(r.role)}
                    </span>
                    <Badge
                      variant={r.status === "APPROVED" ? "neon" : "outline"}
                    >
                      {statusLabel(r.status)}
                    </Badge>
                  </div>
                  <span className="shrink-0 text-xs text-white/50">
                    {dateFmt.format(new Date(r.createdAt))}
                  </span>
                </li>
              ))}
            </SectionCard>
          )}
        </section>
      );
    }
  }
}
