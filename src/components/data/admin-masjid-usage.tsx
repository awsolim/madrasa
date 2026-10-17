"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UsageRange = 7 | 30 | 90;
type DailyUsage = { date: string; users: number };
type UsageSnapshot = {
  error: string | null;
  hasAccess: boolean;
  registeredUsers: number;
  activeToday: number;
  active7Days: number;
  active30Days: number;
  neverActive: number;
  notificationEnabled: number;
  pendingApplications: number;
  awaitingPayment: number;
  pendingWithdrawals: number;
  dailyUsers: DailyUsage[];
};

function UsageLoading() {
  return <div className="min-h-80" aria-label="Loading masjid usage" aria-busy="true" />;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function UsageLineChart({ rows }: { rows: DailyUsage[] }) {
  const width = 640;
  const height = 210;
  const left = 34;
  const right = 12;
  const top = 18;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...rows.map((row) => row.users));
  const points = rows.map((row, index) => ({
    ...row,
    x: left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth),
    y: top + plotHeight - (row.users / max) * plotHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const labelIndexes = Array.from(new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])).filter((index) => index >= 0);

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-[#E2E8E6] bg-white px-2 py-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-h-[210px] w-full" role="img" aria-label="Daily active users">
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight - ratio * plotHeight;
          return <line key={ratio} x1={left} x2={width - right} y1={y} y2={y} stroke="#E5EAE8" strokeWidth="1" />;
        })}
        <text x={left - 8} y={top + 4} textAnchor="end" fontSize="11" fill="#7B858C">{max}</text>
        <text x={left - 8} y={top + plotHeight + 4} textAnchor="end" fontSize="11" fill="#7B858C">0</text>
        {path ? <path d={path} fill="none" stroke="#17624F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="4" fill="#17624F" stroke="white" strokeWidth="2" />
            {rows.length <= 14 || point.users > 0 ? <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="#52616A">{point.users}</text> : null}
          </g>
        ))}
        {labelIndexes.map((index) => {
          const point = points[index];
          return point ? <text key={point.date} x={point.x} y={height - 6} textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"} fontSize="11" fill="#7B858C">{shortDate(point.date)}</text> : null;
        })}
      </svg>
    </div>
  );
}

export function AdminMasjidUsageData({ slug }: { slug: string }) {
  const [range, setRange] = useState<UsageRange>(30);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: UsageRange) => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await createSupabaseBrowserClient().rpc("get_admin_masjid_usage", { p_slug: slug, p_days: days });
    if (loadError) {
      setError("Usage information could not be loaded.");
      setLoading(false);
      return;
    }
    const next = data as unknown as UsageSnapshot | null;
    if (!next?.hasAccess) {
      setError(next?.error || "Admin access required.");
      setLoading(false);
      return;
    }
    setSnapshot(next);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(range); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load, range]);

  const adoption = useMemo(() => {
    if (!snapshot?.registeredUsers) return 0;
    return Math.round((snapshot.active30Days / snapshot.registeredUsers) * 100);
  }, [snapshot]);

  if (loading && !snapshot) return <UsageLoading />;
  if (error && !snapshot) return <div className="p-5 text-sm text-[#A4352A]">{error}</div>;
  if (!snapshot) return null;

  const metrics = [
    { label: "Registered users", value: snapshot.registeredUsers, detail: "Accounts connected to this masjid" },
    { label: "Active today", value: snapshot.activeToday, detail: "Unique users today" },
    { label: "Active in 30 days", value: snapshot.active30Days, detail: `${adoption}% of registered users` },
    { label: "Device notifications", value: snapshot.notificationEnabled, detail: "Users with at least one device" },
  ];

  return (
    <section className="space-y-5 bg-[var(--workspace)] p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-[18px] border border-[#DDE5E3] bg-white p-4">
            <p className="text-xs font-semibold text-[#657178]">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#26323A]">{metric.value}</p>
            <p className="mt-1 text-xs leading-4 text-[#7B858C]">{metric.detail}</p>
          </article>
        ))}
      </div>

      <article className="rounded-[22px] border border-[#DDE5E3] bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#26323A]">Daily active users</h2>
            <p className="mt-1 text-sm text-[#657178]">Unique signed-in users who opened the app.</p>
          </div>
          <div className="flex rounded-full bg-[#EEF2F1] p-1">
            {([7, 30, 90] as const).map((days) => (
              <button key={days} type="button" onClick={() => setRange(days)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", range === days ? "bg-white text-[#17624F] shadow-sm" : "text-[#657178]")}>{days}d</button>
            ))}
          </div>
        </div>
        <UsageLineChart rows={snapshot.dailyUsers ?? []} />
        <p className="mt-3 text-xs leading-5 text-[#7B858C]">Tracking begins when this update is installed. Earlier app activity cannot be reconstructed.</p>
      </article>

      <article className="rounded-[22px] border border-[#DDE5E3] bg-white p-4 md:p-5">
        <h2 className="text-base font-semibold text-[#26323A]">Workflow health</h2>
        <div className="mt-3 divide-y divide-[#E6EAED]">
          <div className="flex items-center justify-between py-3"><span className="text-sm text-[#52616A]">Applications awaiting review</span><strong className="tabular-nums text-[#26323A]">{snapshot.pendingApplications}</strong></div>
          <div className="flex items-center justify-between py-3"><span className="text-sm text-[#52616A]">Approved, awaiting payment</span><strong className="tabular-nums text-[#26323A]">{snapshot.awaitingPayment}</strong></div>
          <div className="flex items-center justify-between py-3"><span className="text-sm text-[#52616A]">Withdrawal requests awaiting review</span><strong className="tabular-nums text-[#26323A]">{snapshot.pendingWithdrawals}</strong></div>
          <div className="flex items-center justify-between py-3"><span className="text-sm text-[#52616A]">Active in the last 7 days</span><strong className="tabular-nums text-[#26323A]">{snapshot.active7Days}</strong></div>
          <div className="flex items-center justify-between py-3"><span className="text-sm text-[#52616A]">Registered but never active</span><strong className="tabular-nums text-[#26323A]">{snapshot.neverActive}</strong></div>
        </div>
      </article>
      {error ? <p className="text-sm text-[#A4352A]">{error}</p> : null}
    </section>
  );
}
