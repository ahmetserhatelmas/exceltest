"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPayload } from "@/lib/dashboard";
import {
  aggregate,
  filterRecords,
  statsForMonth,
} from "@/lib/dashboard";

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

type Props = {
  data: DashboardPayload;
};

export default function Dashboard({ data }: Props) {
  const [ilce, setIlce] = useState<string>("");
  const [mahalle, setMahalle] = useState<string>("");
  const [period, setPeriod] = useState<"toplam" | "aylik">("toplam");
  const [monthIndex, setMonthIndex] = useState(11);

  const mahalleOptions = useMemo(() => {
    if (!ilce) return [];
    return data.mahalleler[ilce] ?? [];
  }, [data.mahalleler, ilce]);

  const filtered = useMemo(
    () =>
      filterRecords(
        data.records,
        ilce || null,
        ilce && mahalle ? mahalle : null
      ),
    [data.records, ilce, mahalle]
  );

  const agg = useMemo(() => aggregate(filtered), [filtered]);

  const kpi = useMemo(
    () =>
      period === "toplam" ? agg : statsForMonth(agg, monthIndex),
    [agg, period, monthIndex]
  );

  const axisTick = {
    fill: "var(--chart-tick)",
    fontSize: 12,
    fontWeight: 500,
  } as const;

  const chartData = useMemo(
    () =>
      data.months.map((ay, i) => ({
        ay,
        m3: agg.monthly[i]?.m3 ?? 0,
        tahakkuk: agg.monthly[i]?.tahakkuk ?? 0,
      })),
    [agg.monthly, data.months]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Su tüketimi panosu
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Tüketim: Veri.xlsx (Sayfa1) — güncelleme{" "}
          {new Date(data.generatedAt).toLocaleString("tr-TR")}
          {data.nufusKaynak ? (
            <>
              <br />
              Nüfus: {data.nufusKaynak}
            </>
          ) : null}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:flex-wrap md:items-end">
        <label className="flex min-w-[160px] flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          İlçe
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            value={ilce}
            onChange={(e) => {
              setIlce(e.target.value);
              setMahalle("");
            }}
          >
            <option value="">Tümü</option>
            {data.ilceler.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[200px] flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Mahalle
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            value={mahalle}
            disabled={!ilce}
            onChange={(e) => setMahalle(e.target.value)}
          >
            <option value="">Tümü</option>
            {mahalleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3">
          <span className="w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 md:w-auto">
            Gösterim
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriod("toplam")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                period === "toplam"
                  ? "bg-sky-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              Yıllık toplam
            </button>
            <button
              type="button"
              onClick={() => setPeriod("aylik")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                period === "aylik"
                  ? "bg-sky-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              Aylık
            </button>
          </div>
        </div>

        {period === "aylik" && (
          <label className="flex min-w-[140px] flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Ay
            <select
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
            >
              {data.months.map((ay, i) => (
                <option key={ay} value={i}>
                  {ay}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Seçime göre <strong>{filtered.length}</strong> defter kaydı
      </p>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Abone / nüfus"
          subtitle={kpi.hasNufusData ? "yüzde" : "nüfus eşleşmesi yok"}
          value={
            kpi.aboneNufusYuzde != null
              ? `${nf.format(kpi.aboneNufusYuzde)} %`
              : "—"
          }
        />
        <KpiCard
          title="M³ / abone"
          subtitle={period === "aylik" ? "seçilen ay" : "yıl toplamı"}
          value={
            kpi.m3PerAbone != null ? nf.format(kpi.m3PerAbone) : "—"
          }
        />
        <KpiCard
          title="Birim fiyat"
          subtitle="tahakkuk ÷ M³ (TL/m³)"
          value={
            kpi.birimFiyat != null ? `${nf.format(kpi.birimFiyat)} ₺` : "—"
          }
        />
        <KpiCard
          title="Toplam abone"
          subtitle="seçili alan"
          value={nf0.format(kpi.totalAbone)}
        />
      </section>

      <section className="grid gap-8 lg:grid-cols-1">
        <ChartCard title="Aylık metreküp (M³) tüketimi">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-tooltip-border)" />
              <XAxis
                dataKey="ay"
                tick={axisTick}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={56}
              />
              <YAxis
                tick={{ ...axisTick, fontSize: 11 }}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                tickFormatter={(v) => nf0.format(v)}
              />
              <Tooltip
                formatter={(value) =>
                  nf0.format(typeof value === "number" ? value : Number(value))
                }
                contentStyle={{
                  borderRadius: 8,
                  background: "var(--background)",
                  border: "1px solid var(--chart-tooltip-border)",
                  color: "var(--foreground)",
                }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ color: "var(--chart-tick)", fontSize: 13 }} />
              <Bar dataKey="m3" name="M³" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aylık tahakkuk (TL)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-tooltip-border)" />
              <XAxis
                dataKey="ay"
                tick={axisTick}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={56}
              />
              <YAxis
                tick={{ ...axisTick, fontSize: 11 }}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                tickFormatter={(v) => nf0.format(v)}
              />
              <Tooltip
                formatter={(value) =>
                  nf.format(typeof value === "number" ? value : Number(value))
                }
                contentStyle={{
                  borderRadius: 8,
                  background: "var(--background)",
                  border: "1px solid var(--chart-tooltip-border)",
                  color: "var(--foreground)",
                }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ color: "var(--chart-tick)", fontSize: 13 }} />
              <Bar dataKey="tahakkuk" name="Tahakkuk (TL)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </div>
  );
}

function KpiCard({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {children}
    </div>
  );
}
