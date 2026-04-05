"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
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
import type {
  DashboardPayload,
  IlcePerformansSatiri,
  IlcePerformansToplam,
} from "@/lib/dashboard";
import {
  aggregate,
  collectKaynakDepoSummary,
  computeIlcePerformans,
  filterRecords,
  recordTahakkukDönem,
  statsForMonth,
} from "@/lib/dashboard";

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const chartMargin = { top: 8, right: 12, left: 22, bottom: 8 } as const;
const yAxisWidth = 108;

function formatYAxisTl(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${nf.format(n / 1_000_000)} mn`;
  if (a >= 10_000) return `${nf0.format(Math.round(n / 1_000))} bin`;
  return nf0.format(n);
}

function formatYAxisM3(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return nf0.format(n);
}

function legendFormatter(value: string) {
  return <span style={{ color: "var(--chart-tick)" }}>{value}</span>;
}

type Props = {
  data: DashboardPayload;
};

export default function Dashboard({ data }: Props) {
  const [ilce, setIlce] = useState<string>("");
  const [mahalle, setMahalle] = useState<string>("");
  const [monthIndex, setMonthIndex] = useState(0);

  const [kaynakPanelOpen, setKaynakPanelOpen] = useState(true);
  const [ilcePerformansPanelOpen, setIlcePerformansPanelOpen] = useState(true);
  const [muhtarPanelOpen, setMuhtarPanelOpen] = useState(true);
  const [muhtarTabloAra, setMuhtarTabloAra] = useState("");

  const currentYear = useMemo(
    () => new Date(data.generatedAt).getFullYear(),
    [data.generatedAt]
  );

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
    () => statsForMonth(agg, monthIndex),
    [agg, monthIndex]
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

  const kaynakOzeti = useMemo(
    () => collectKaynakDepoSummary(filtered),
    [filtered]
  );

  const kaynakCounts = useMemo(() => {
    if (!kaynakOzeti) return null;
    const countItems = (s: string) =>
      s
        ? s
            .split(";")
            .map((x) => x.trim())
            .filter(Boolean).length
        : 0;
    return {
      depo: countItems(kaynakOzeti.depo),
      kaynak: countItems(kaynakOzeti.kaynak),
      terfi: countItems(kaynakOzeti.terfi),
    };
  }, [kaynakOzeti]);

  const ilcePerformansResult = useMemo(
    () =>
      computeIlcePerformans(data.records, {
        tur: "aylik",
        ayIndeks: monthIndex,
      }),
    [data.records, monthIndex]
  );

  const defterIletisimSatirlari = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const c = a.ilce.localeCompare(b.ilce, "tr-TR");
      if (c !== 0) return c;
      const m = a.mahalle.localeCompare(b.mahalle, "tr-TR");
      if (m !== 0) return m;
      return a.defterNo - b.defterNo;
    });
    const q = muhtarTabloAra.trim().toLocaleLowerCase("tr-TR");
    if (!q) return sorted;
    return sorted.filter((r) => {
      const s =
        `${r.ilce} ${r.mahalle} ${r.muhtar ?? ""} ${r.telefon ?? ""} ${r.defterNo}`.toLocaleLowerCase(
          "tr-TR"
        );
      return s.includes(q);
    });
  }, [filtered, muhtarTabloAra]);

  const selectedMonthLabel = data.months[monthIndex] ?? `Ay ${monthIndex + 1}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          MESKİ Su Tüketimi Panosu
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

      {/* ── FİLTRELER ── */}
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:flex-wrap md:items-end">
        <label className="flex min-w-[110px] flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Yıl
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            value={currentYear}
            disabled
          >
            <option value={currentYear}>{currentYear}</option>
          </select>
        </label>

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
      </section>

      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Seçime göre <strong>{filtered.length}</strong> defter kaydı —{" "}
        <strong>{selectedMonthLabel} {currentYear}</strong>
      </p>

      {/* ── ÖZET (KPI 2×3) ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Özet
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard
            title="Toplam nüfus"
            subtitle={
              kpi.hasNufusData
                ? "benzersiz mahalle"
                : "nüfus eşleşmesi yok"
            }
            value={kpi.hasNufusData ? nf0.format(kpi.totalNufus) : "—"}
          />
          <KpiCard
            title="Toplam abone"
            subtitle="seçili alan"
            value={nf0.format(kpi.totalAbone)}
          />
          <KpiCard
            title="Toplam tahakkuk"
            subtitle={`${selectedMonthLabel} (TL)`}
            value={nf.format(kpi.totalTahakkuk)}
            valueCompact
          />
          <KpiCard
            title="Birim fiyat"
            subtitle="tahakkuk ÷ M³ (TL/m³)"
            value={
              kpi.birimFiyat != null ? `${nf.format(kpi.birimFiyat)} ₺` : "—"
            }
          />
          <KpiCard
            title="Abone / nüfus"
            subtitle={kpi.hasNufusData ? "yüzde" : "nüfus eşleşmesi yok"}
            value={
              kpi.aboneNufusYuzde != null
                ? `% ${nf.format(kpi.aboneNufusYuzde)}`
                : "—"
            }
          />
          <KpiCard
            title="M³ / abone"
            subtitle={selectedMonthLabel}
            value={
              kpi.m3PerAbone != null ? nf.format(kpi.m3PerAbone) : "—"
            }
          />
        </div>
      </section>

      {/* ── MUHTAR İLETİŞİM PANELİ ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setMuhtarPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none ring-violet-500/40 transition hover:bg-black/[0.03] focus-visible:ring-2 dark:hover:bg-white/[0.04]"
          aria-expanded={muhtarPanelOpen}
          aria-controls="muhtar-iletisim-panel"
          id="muhtar-iletisim-toggle"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Muhtar iletişim paneli
          </h2>
          <ChevronIcon open={muhtarPanelOpen} color="text-violet-600 dark:text-violet-400" />
        </button>

        <div
          id="muhtar-iletisim-panel"
          role="region"
          aria-labelledby="muhtar-iletisim-toggle"
          className={muhtarPanelOpen ? "mt-3" : "hidden"}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Sayfa1: muhtar ve telefon. Tahakkuk seçilen aya göre.
            Arama: ilçe, mahalle, muhtar, telefon, defter no.
          </p>
          <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span className="sr-only">Tabloda ara</span>
            <input
              type="search"
              value={muhtarTabloAra}
              onChange={(e) => setMuhtarTabloAra(e.target.value)}
              placeholder="İlçe, mahalle, muhtar, telefon…"
              className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <p className="mt-2 text-xs text-zinc-500">
            {defterIletisimSatirlari.length} / {filtered.length} satır
          </p>
          <div className="mt-3 max-h-[min(28rem,70vh)] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Defter
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    İlçe
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Mahalle
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Muhtar
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Telefon
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Abone
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Tahakkuk ({selectedMonthLabel}, TL)
                  </th>
                </tr>
              </thead>
              <tbody>
                {defterIletisimSatirlari.map((r) => {
                  const tah = recordTahakkukDönem(r, "aylik", monthIndex);
                  return (
                    <tr
                      key={`${r.defterNo}-${r.ilce}-${r.mahalle}`}
                      className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                        {r.defterNo}
                      </td>
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                        {r.ilce}
                      </td>
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                        {r.mahalle}
                      </td>
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                        {r.muhtar?.trim() ? r.muhtar : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-800 dark:text-zinc-200">
                        {r.telefon?.trim() ? r.telefon : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                        {nf0.format(r.abone)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                        {nf.format(tah)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── SU ALTYAPI ENVANTERİ (Kaynak — depo — terfi) ── */}
      <section
        className={`rounded-xl border p-4 text-sm ${
          kaynakOzeti
            ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30"
            : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"
        }`}
      >
        <button
          type="button"
          onClick={() => setKaynakPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none ring-emerald-500/40 transition hover:bg-black/[0.03] focus-visible:ring-2 dark:hover:bg-white/[0.04]"
          aria-expanded={kaynakPanelOpen}
          aria-controls="kaynak-depo-terfi-panel"
          id="kaynak-depo-terfi-toggle"
        >
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Su altyapı envanteri
            </h2>
            {kaynakCounts && (
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                Kaynak: {kaynakCounts.kaynak} · Depo: {kaynakCounts.depo} · Terfi: {kaynakCounts.terfi}
              </p>
            )}
          </div>
          <ChevronIcon open={kaynakPanelOpen} color="text-emerald-600 dark:text-emerald-400" />
        </button>

        <div
          id="kaynak-depo-terfi-panel"
          role="region"
          aria-labelledby="kaynak-depo-terfi-toggle"
          className={kaynakPanelOpen ? "mt-3" : "hidden"}
        >
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-500">
            Veri.xlsx, <strong>KAYNAK-TERFİ-DEPO</strong> sayfası; seçili
            ilçe/mahalle defterleriyle eşleşen adlar (benzersiz liste).
          </p>
          {kaynakOzeti ? (
            <div className="flex flex-col gap-3 text-zinc-800 dark:text-zinc-200">
              {kaynakOzeti.depo ? (
                <OzetiBlock label="Depo adı" text={kaynakOzeti.depo} />
              ) : null}
              {kaynakOzeti.kaynak ? (
                <OzetiBlock label="Kaynak adı" text={kaynakOzeti.kaynak} />
              ) : null}
              {kaynakOzeti.terfi ? (
                <OzetiBlock label="İçme suyu terfi" text={kaynakOzeti.terfi} />
              ) : null}
            </div>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-500">
              Bu seçim için KAYNAK-TERFİ-DEPO eşleşmesi yok (mahalle/ilçe adı
              tabloda farklı yazılmış olabilir).
            </p>
          )}
        </div>
      </section>

      {/* ── SAHA OKUMA PERFORMANSI (İlçe bazlı) ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setIlcePerformansPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none ring-sky-500/40 transition hover:bg-black/[0.03] focus-visible:ring-2 dark:hover:bg-white/[0.04]"
          aria-expanded={ilcePerformansPanelOpen}
          aria-controls="ilce-performans-panel"
          id="ilce-performans-toggle"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Saha okuma performansı
          </h2>
          <ChevronIcon open={ilcePerformansPanelOpen} color="text-sky-600 dark:text-sky-400" />
        </button>

        <div
          id="ilce-performans-panel"
          role="region"
          aria-labelledby="ilce-performans-toggle"
          className={ilcePerformansPanelOpen ? "mt-3" : "hidden"}
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            <strong>{selectedMonthLabel} {currentYear}</strong> verisi.
            Tüm defterler üzerinden ilçe bazında toplanır (mahalle filtresi bu tabloyu daraltmaz).
          </p>

          {/* Toplam KPI bandı */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniKpi
              label="Toplam Abone"
              value={nf0.format(ilcePerformansResult.toplam.toplamAbone)}
            />
            <MiniKpi
              label="Toplam Okuma"
              value={nf0.format(ilcePerformansResult.toplam.toplamOkuma)}
            />
            <MiniKpi
              label="Okuma Oranı"
              value={`% ${nf1.format(ilcePerformansResult.toplam.okumaOrani)}`}
            />
            <MiniKpi
              label="Fatura Adedi"
              value={nf0.format(ilcePerformansResult.toplam.toplamFatura)}
            />
            <MiniKpi
              label="Faturalama Başarısı"
              value={`% ${nf1.format(ilcePerformansResult.toplam.faturaBasarisi)}`}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    Sıra
                  </th>
                  <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                    İlçe
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                    Σ Abone
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                    Σ Okuma
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                    Okuma Oranı %
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                    Fatura Adedi
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                    Faturalama Başarısı %
                  </th>
                </tr>
              </thead>
              <tbody>
                {ilcePerformansResult.satirlar.map((row) => (
                  <IlcePerformansRow
                    key={row.ilce}
                    row={row}
                    seciliIlce={ilce}
                  />
                ))}
              </tbody>
              <tfoot>
                <IlcePerformansTotalRow toplam={ilcePerformansResult.toplam} />
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* ── GRAFİKLER ── */}
      <section className="grid gap-8 lg:grid-cols-1">
        <ChartCard title="Aylık metreküp (M³) tüketimi">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={chartMargin}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-tooltip-border)"
              />
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
                width={yAxisWidth}
                tick={{ ...axisTick, fontSize: 11 }}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                tickFormatter={formatYAxisM3}
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
              <Legend
                wrapperStyle={{ fontSize: 13 }}
                formatter={legendFormatter}
              />
              <Bar
                dataKey="m3"
                name="M³"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aylık tahakkuk (TL)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={chartMargin}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-tooltip-border)"
              />
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
                width={yAxisWidth}
                tick={{ ...axisTick, fontSize: 11 }}
                tickLine={{ stroke: "var(--chart-tick)" }}
                axisLine={{ stroke: "var(--chart-tooltip-border)" }}
                tickFormatter={formatYAxisTl}
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
              <Legend
                wrapperStyle={{ fontSize: 13 }}
                formatter={legendFormatter}
              />
              <Bar
                dataKey="tahakkuk"
                name="Tahakkuk (TL)"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </div>
  );
}

/* ─── ALT BİLEŞENLER ─── */

function ChevronIcon({ open, color }: { open: boolean; color: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-5 w-5 shrink-0 ${color} transition-transform duration-200 ${
        open ? "" : "-rotate-90"
      }`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}

function IlcePerformansRow({
  row,
  seciliIlce,
}: {
  row: IlcePerformansSatiri;
  seciliIlce: string;
}) {
  const vurgu = Boolean(seciliIlce && row.ilce === seciliIlce);
  return (
    <tr
      className={`border-b border-zinc-100 dark:border-zinc-800/80 ${
        vurgu
          ? "bg-sky-50 dark:bg-sky-950/35"
          : "hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
      }`}
    >
      <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
        {row.basariSirasi}
      </td>
      <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
        {row.ilce}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {nf0.format(row.toplamAbone)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {nf0.format(row.toplamOkuma)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {nf1.format(row.okumaOrani)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {nf0.format(row.toplamFatura)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {nf1.format(row.faturaBasarisi)}
      </td>
    </tr>
  );
}

function IlcePerformansTotalRow({ toplam }: { toplam: IlcePerformansToplam }) {
  return (
    <tr className="border-t-2 border-zinc-300 bg-zinc-100 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400" />
      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">TOPLAM</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {nf0.format(toplam.toplamAbone)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {nf0.format(toplam.toplamOkuma)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {nf1.format(toplam.okumaOrani)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {nf0.format(toplam.toplamFatura)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {nf1.format(toplam.faturaBasarisi)}
      </td>
    </tr>
  );
}

function splitOzetiItems(text: string): string[] {
  return text
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function OzetiBlock({ label, text }: { label: string; text: string }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const items = useMemo(() => splitOzetiItems(text), [text]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return items;
    return items.filter((item) =>
      item.toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setQuery("");
  }, [text]);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        {label}
        {items.length > 0 ? (
          <span className="ml-2 font-normal normal-case text-zinc-500 dark:text-zinc-500">
            ({items.length} kayıt)
            {query.trim() ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                {" "}
                · {filtered.length} eşleşme
              </span>
            ) : null}
          </span>
        ) : null}
      </p>
      {items.length > 0 ? (
        <div className="mb-2">
          <label htmlFor={searchId} className="sr-only">
            {label} içinde ara
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsimde ara…"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700">
          —
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          &quot;{query.trim()}&quot; için sonuç yok.
        </p>
      ) : (
        <ul className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-zinc-200/80 bg-white/90 p-2 dark:border-zinc-700 dark:bg-zinc-950/80">
          {filtered.map((item, i) => (
            <li
              key={`${label}-f-${i}-${item.slice(0, 24)}`}
              className="flex gap-2 rounded-md border border-zinc-100 bg-zinc-50/90 px-3 py-2 text-[13px] leading-snug text-zinc-800 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-200"
            >
              <span
                className="shrink-0 select-none font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-500"
                aria-hidden
              >
                {i + 1}.
              </span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KpiCard({
  title,
  subtitle,
  value,
  valueCompact = false,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueCompact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p
        className={`mt-2 min-w-0 max-w-full break-all font-semibold tabular-nums leading-snug text-zinc-900 dark:text-zinc-50 ${
          valueCompact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{subtitle}</p>
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
