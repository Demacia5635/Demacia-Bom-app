import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchFromApi } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { statsFromEvents, type ChartEvent, type Stats } from "./telemetryStats";


/**
 * The request kinds as chart series, in a fixed order (a kind keeps its colour
 * whatever is shown). The three rare kinds fold into "Other" so the chart
 * stays within the palette's eight validated hues.
 */
const SERIES = [
  { key: "bom", label: "BOM reads" },
  { key: "metadataRead", label: "Property reads" },
  { key: "metadataWrite", label: "Property writes" },
  { key: "render", label: "Images" },
  { key: "stl", label: "STL" },
  { key: "parasolid", label: "Parasolid" },
  { key: "other", label: "Other" },
];
const OTHER_KINDS = new Set(["session", "modelCheck", "other"]);
// The dataviz reference palette, slots 1-7, validated for each theme's surface.
const COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9"],
};
// Failures are a status (critical), never a series colour.
const FAILURE = { light: "#c62828", dark: "#ef5350" };


/**
 * Charts on /tele (QW28): Onshape requests per day by kind, requests per
 * user, and failures per day. From the server's /telemetry/stats for the range
 * (all users), or from the loaded events when one user is picked or the server
 * doesn't have the route yet.
 */
export default function TelemetryCharts({ days, events, userPicked }: { days: number | null; events: ChartEvent[]; userPicked: boolean }) {
  const { isLight } = useThemeSync();
  const theme = useThemeClasses();
  const [serverStats, setServerStats] = useState<{ days: number | null; stats: Stats } | null>(null);
  const [noRoute, setNoRoute] = useState(false);

  useEffect(() => {
    if (userPicked || noRoute) return;
    let cancelled = false;
    // "All time": the route covers at most 366 days.
    const from = new Date(Date.now() - (days ?? 366) * 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    fetchFromApi<Stats>(`/telemetry/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((stats) => { if (!cancelled) setServerStats({ days, stats }); })
      .catch(() => { if (!cancelled) setNoRoute(true); });
    return () => { cancelled = true; };
  }, [days, userPicked, noRoute]);

  const fromServer = !userPicked && !noRoute && serverStats?.days === days ? serverStats.stats : null;
  const stats = useMemo(() => fromServer ?? statsFromEvents(events), [fromServer, events]);

  const colors = isLight ? COLORS.light : COLORS.dark;
  const failure = isLight ? FAILURE.light : FAILURE.dark;
  const ink = isLight ? "#52514e" : "#c3c2b7";
  const grid = isLight ? "#e4e4e7" : "#3f3f46";
  const tooltip = {
    contentStyle: { background: isLight ? "#ffffff" : "#18181b", border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12, color: isLight ? "#0b0b0b" : "#f0efec" },
    labelStyle: { fontWeight: 600 },
    cursor: { fill: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)" },
  };
  const axis = { stroke: grid, tick: { fill: ink, fontSize: 11 }, tickLine: false };

  const perDay = stats.days.map((d) => {
    const row: Record<string, number | string> = { day: d.day.slice(5) };
    for (const s of SERIES) row[s.key] = 0;
    for (const [kind, n] of Object.entries(d.byKind)) {
      const key = OTHER_KINDS.has(kind) || !SERIES.some((s) => s.key === kind) ? "other" : kind;
      row[key] = (row[key] as number) + n;
    }
    return row;
  });
  const shownSeries = SERIES.map((s, i) => ({ ...s, color: colors[i] })).filter((s) => perDay.some((row) => (row[s.key] as number) > 0));
  const perUser = stats.users.slice(0, 10).map((u) => ({ user: u.user || "(unknown)", requests: u.requests }));
  const failures = stats.days.map((d) => ({ day: d.day.slice(5), failed: d.failed, failedEvents: d.failedEvents }));

  if (stats.days.length === 0) return null;
  const card = `border rounded-xl p-4 ${theme.card}`;
  const title = `text-sm font-semibold mb-2 ${theme.textHeading}`;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className={`${card} lg:col-span-2`} aria-label="Onshape requests per day, by kind">
        <h2 className={title}>Onshape requests per day, by kind</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={perDay} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={grid} strokeOpacity={0.6} />
            <XAxis dataKey="day" {...axis} />
            <YAxis allowDecimals={false} {...axis} axisLine={false} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 12, color: ink }} iconType="square" />
            {shownSeries.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="kinds" fill={s.color} stroke={isLight ? "#ffffff" : "#18181b"} strokeWidth={1}
                radius={i === shownSeries.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className={card} aria-label="Onshape requests per user">
        <h2 className={title}>Requests per user{perUser.length === 10 ? " (top 10)" : ""}</h2>
        <ResponsiveContainer width="100%" height={Math.max(120, perUser.length * 32 + 30)}>
          <BarChart data={perUser} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={grid} strokeOpacity={0.6} />
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey="user" width={110} {...axis} axisLine={false} />
            <Tooltip {...tooltip} />
            <Bar dataKey="requests" name="Requests" fill={colors[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className={card} aria-label="Failures per day">
        <h2 className={title}>Failures per day</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={failures} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={grid} strokeOpacity={0.6} />
            <XAxis dataKey="day" {...axis} />
            <YAxis allowDecimals={false} {...axis} axisLine={false} />
            <Tooltip {...tooltip} cursor={{ stroke: grid }} />
            <Legend wrapperStyle={{ fontSize: 12, color: ink }} />
            <Line type="monotone" dataKey="failed" name="Failed requests" stroke={failure} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="failedEvents" name="Failed operations" stroke={failure} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: "transparent" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
