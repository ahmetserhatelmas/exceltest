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
  HatUzunlukHucre,
  IlcePerformansSatiri,
  IlcePerformansToplam,
} from "@/lib/dashboard";
import {
  aggregate,
  collectKaynakDepoSummary,
  computeIlcePerformans,
  elektrikDetayDonemToplam,
  elektrikDetayIlceDonem,
  filterRecords,
  hatHucreYilOzeti,
  recordTahakkukDönem,
  statsForMonth,
} from "@/lib/dashboard";

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function formatMetreCell(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return nf0.format(v);
}

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

type SectionId = "ozet" | "muhtar" | "altyapi" | "hatlar" | "ilce" | "elektrik";

const NAV_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "muhtar", label: "Muhtar İletişim" },
  { id: "altyapi", label: "Su Altyapı Envanteri" },
  { id: "hatlar", label: "Altyapı Hatları" },
  { id: "ilce", label: "İlçe Bazlı Okuma" },
  { id: "elektrik", label: "Elektrik Özeti" },
];

type Props = { data: DashboardPayload };

export default function Dashboard({ data }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("ozet");
  const [ilce, setIlce] = useState("");
  const [mahalle, setMahalle] = useState("");
  /** -1 = Tümü (yıllık toplam), 0–11 = ay indeksi */
  const [monthIndex, setMonthIndex] = useState<number>(-1);
  const [muhtarAra, setMuhtarAra] = useState("");
  const [kaynakPanelOpen, setKaynakPanelOpen] = useState(true);

  const dataYear = data.dataYear ?? 2025;
  /** Üst filtre: yalnızca veri yılı ve bir sonraki plan yılı (müşteri: 2025 / 2026) */
  const availableYears = useMemo(() => [dataYear, dataYear + 1], [dataYear]);
  const hatYillarList = useMemo(
    () => data.hatUzunluklari?.yillar ?? [],
    [data.hatUzunluklari?.yillar]
  );
  const [selectedYear, setSelectedYear] = useState<number>(dataYear);
  /** Hat uzunluğu Excel sütunlarındaki takvim yılı (üstteki 2025/2026’dan bağımsız) */
  const [hatEnvYili, setHatEnvYili] = useState<number>(dataYear);

  useEffect(() => {
    if (!hatYillarList.length) return;
    setHatEnvYili((y) =>
      hatYillarList.includes(y)
        ? y
        : hatYillarList.includes(dataYear)
          ? dataYear
          : hatYillarList[hatYillarList.length - 1]!
    );
  }, [hatYillarList, dataYear]);

  /** Seçilen yıl için veri var mı? (yalnızca dataYear'a ait kayıtlar mevcut) */
  const hasDataForYear = selectedYear === dataYear;

  const isYearly = monthIndex === -1;

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
    () => (isYearly ? agg : statsForMonth(agg, monthIndex)),
    [agg, isYearly, monthIndex]
  );

  /**
   * Gösterilecek nüfus:
   *  - Filtre yok   → Nufus.xlsx toplam (eşleşmeden bağımsız)
   *  - İlçe filtresi → Nufus.xlsx ilçe toplamı
   *  - Mahalle filtresi → Veri.xlsx eşleşmesinden (mevcut davranış)
   */
  const displayNufus = useMemo((): number | null => {
    if (!ilce) return data.nufusToplam ?? (kpi.hasNufusData ? kpi.totalNufus : null);
    if (!mahalle) return data.nufusIlceToplam?.[ilce] ?? (kpi.hasNufusData ? kpi.totalNufus : null);
    return kpi.hasNufusData ? kpi.totalNufus : null;
  }, [ilce, mahalle, data.nufusToplam, data.nufusIlceToplam, kpi.hasNufusData, kpi.totalNufus]);

  const displayAboneNufusYuzde = useMemo((): number | null => {
    if (displayNufus == null || displayNufus <= 0) return null;
    return (kpi.totalAbone / displayNufus) * 100;
  }, [displayNufus, kpi.totalAbone]);

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
      computeIlcePerformans(
        data.records,
        isYearly ? { tur: "yillik" } : { tur: "aylik", ayIndeks: monthIndex }
      ),
    [data.records, isYearly, monthIndex]
  );

  const defterSatirlari = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const c = a.ilce.localeCompare(b.ilce, "tr-TR");
      if (c !== 0) return c;
      const m = a.mahalle.localeCompare(b.mahalle, "tr-TR");
      if (m !== 0) return m;
      return a.defterNo - b.defterNo;
    });
    const q = muhtarAra.trim().toLocaleLowerCase("tr-TR");
    if (!q) return sorted;
    return sorted.filter((r) =>
      `${r.ilce} ${r.mahalle} ${r.muhtar ?? ""} ${r.telefon ?? ""} ${r.defterNo}`
        .toLocaleLowerCase("tr-TR")
        .includes(q)
    );
  }, [filtered, muhtarAra]);

  const selectedMonthLabel = isYearly
    ? "Tümü (Yıllık)"
    : (data.months[monthIndex] ?? `Ay ${monthIndex + 1}`);
  const elektrik = data.elektrik;
  const hatUzunluklari = data.hatUzunluklari;

  /** Elektrik: üst yıl = veri dosyası yılı (dataYear) iken ay/ilçe; plan yılı (2026) henüz boş */
  const elektrikDonem = useMemo(() => {
    const e = data.elektrik;
    if (!e?.detay?.length) return null;
    const yilOk = selectedYear === dataYear;
    const yDet = e.detay.find((x) => x.key === "yagmur");
    const kDet = e.detay.find((x) => x.key === "kanalizasyon");
    const iDet = e.detay.find((x) => x.key === "icme");
    if (!yDet || !kDet || !iDet) return null;

    if (!yilOk) {
      const detayTablo = e.detay.map((d) => ({
        key: d.key,
        label: d.label,
        kwh: null as number | null,
        tahakkuk: null as number | null,
        countOut: null as number | null,
      }));
      return {
        yilOk: false,
        detayTablo,
        toplamKwh: null as number | null,
        toplamTahakkuk: null as number | null,
        suTahakkuku: null as number | null,
        netGelir: null as number | null,
        ilceTablo: [] as Array<{
          ilce: string;
          toplamKwh: number;
          toplamTahakkuk: number;
          yagmurKwh: number;
          kanalizasyonKwh: number;
          icmeKwh: number;
        }>,
      };
    }

    const detayTablo = e.detay.map((d) => {
      const v = ilce.trim()
        ? elektrikDetayIlceDonem(d, ilce, isYearly, monthIndex)
        : elektrikDetayDonemToplam(d, isYearly, monthIndex);
      const countOut = ilce.trim()
        ? elektrikDetayIlceDonem(d, ilce, isYearly, monthIndex).count
        : isYearly
          ? d.count
          : null;
      return {
        key: d.key,
        label: d.label,
        kwh: v.kwh,
        tahakkuk: v.tahakkuk,
        countOut,
      };
    });

    const toplamKwh = detayTablo.reduce((s, r) => s + r.kwh, 0);
    const toplamTah = detayTablo.reduce((s, r) => s + r.tahakkuk, 0);
    const suTah = kpi.totalTahakkuk;
    const netGelir = suTah - toplamTah;

    const ilceListe = ilce.trim()
      ? [ilce]
      : (e.ilceDetay?.map((r) => r.ilce) ?? data.ilceler);

    const ilceTablo = ilceListe.map((ilceAdi) => {
      const y = elektrikDetayIlceDonem(yDet, ilceAdi, isYearly, monthIndex);
      const k = elektrikDetayIlceDonem(kDet, ilceAdi, isYearly, monthIndex);
      const ic = elektrikDetayIlceDonem(iDet, ilceAdi, isYearly, monthIndex);
      const ty = y.kwh + k.kwh + ic.kwh;
      const tt = y.tahakkuk + k.tahakkuk + ic.tahakkuk;
      return {
        ilce: ilceAdi,
        toplamKwh: ty,
        toplamTahakkuk: tt,
        yagmurKwh: y.kwh,
        kanalizasyonKwh: k.kwh,
        icmeKwh: ic.kwh,
      };
    });

    return {
      yilOk,
      detayTablo,
      toplamKwh,
      toplamTahakkuk: toplamTah,
      suTahakkuku: suTah,
      netGelir,
      ilceTablo,
    };
  }, [
    data.elektrik,
    data.ilceler,
    dataYear,
    selectedYear,
    ilce,
    isYearly,
    monthIndex,
    kpi.totalTahakkuk,
  ]);

  /** Hat uzunlukları: Excel takvim yılı (hatEnvYili) + ilçe */
  const hatYilOzet = useMemo(() => {
    const h = data.hatUzunluklari;
    if (!h?.ilceler?.length) return null;
    const rows = ilce.trim()
      ? h.ilceler.filter((r) => r.ilce === ilce)
      : h.ilceler;

    type HatIlceSatiri = {
      ilce: string;
      icmeSuyu: HatUzunlukHucre | null;
      kanalizasyon: HatUzunlukHucre | null;
      yagmurSuyu: HatUzunlukHucre | null;
    };
    const toplaTip = (pick: (r: HatIlceSatiri) => HatUzunlukHucre | null) => {
      let is = 0;
      let ya = 0;
      for (const row of rows) {
        const o = hatHucreYilOzeti(pick(row), hatEnvYili);
        is += o.isletme;
        ya += o.yatirim;
      }
      const ek = is + ya;
      return {
        ekMetre: ek,
        isletmeYuzde: ek > 0 ? (is / ek) * 100 : null,
        yatirimYuzde: ek > 0 ? (ya / ek) * 100 : null,
      };
    };

    return {
      rows,
      icme: toplaTip((r) => r.icmeSuyu),
      kanal: toplaTip((r) => r.kanalizasyon),
      yagmur: toplaTip((r) => r.yagmurSuyu),
    };
  }, [data.hatUzunluklari, ilce, hatEnvYili]);

  const aboneSekmesiBos =
    !hasDataForYear &&
    (activeSection === "ozet" ||
      activeSection === "muhtar" ||
      activeSection === "altyapi" ||
      activeSection === "ilce");

  const selectCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── BAŞLIK ── */}
      <header className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          MESKİ Su Tüketimi Panosu
        </h1>
        <p className="text-xs text-zinc-500">
          Güncelleme: {new Date(data.generatedAt).toLocaleString("tr-TR")}
          {data.nufusKaynak && ` · Nüfus: ${data.nufusKaynak}`}
        </p>
      </header>

      {/* ── FİLTRELER ── */}
      <div className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-end gap-3">
          <label
            className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400"
            title="Abone ve su tüketimi: veri yılı ile bir sonraki plan yılı (ör. 2025 / 2026)."
          >
            Yıl
            <select
              className={selectCls}
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label
            className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400"
            title="Elektrik tüketimi Excel’de ay sütunlarına göre filtrelenir."
          >
            Ay
            <select
              className={selectCls}
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
            >
              <option value={-1}>Tümü (Yıllık)</option>
              {data.months.map((ay, i) => (
                <option key={ay} value={i}>
                  {ay}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            İlçe
            <select
              className={selectCls}
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

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Mahalle
            <select
              className={selectCls}
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

          <p className="ml-auto self-end text-xs text-zinc-500">
            <strong>{filtered.length}</strong> defter ·{" "}
            <strong>
              {selectedMonthLabel} {dataYear}
            </strong>
            {hatYillarList.length > 0 && (
              <> · Hat envanteri yılı: &quot;Altyapı Hatları&quot; sekmesinden</>
            )}
          </p>
        </div>
      </div>

      {/* ── KPI ŞERİDİ — her bölümde sabit ── */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        {hasDataForYear ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <KpiCard
              title="Toplam nüfus"
              subtitle={displayNufus != null ? (mahalle ? "eşleşen mahalle" : "Nufus.xlsx") : "eşleşme yok"}
              value={displayNufus != null ? nf0.format(displayNufus) : "—"}
            />
            <KpiCard
              title="Toplam abone"
              subtitle="seçili alan"
              value={nf0.format(kpi.totalAbone)}
            />
            <KpiCard
              title="Toplam tahakkuk"
              subtitle={isYearly ? "yıllık toplam (TL)" : `${selectedMonthLabel} (TL)`}
              value={nf.format(kpi.totalTahakkuk)}
              valueCompact
            />
            <KpiCard
              title="Birim fiyat"
              subtitle="TL/m³"
              value={
                kpi.birimFiyat != null ? `${nf.format(kpi.birimFiyat)} ₺` : "—"
              }
            />
            <KpiCard
              title="Abone / nüfus"
              subtitle={displayAboneNufusYuzde != null ? "yüzde" : "eşleşme yok"}
              value={
                displayAboneNufusYuzde != null
                  ? `% ${nf.format(displayAboneNufusYuzde)}`
                  : "—"
              }
            />
            <KpiCard
              title="M³ / abone"
              subtitle={isYearly ? "yıllık toplam" : selectedMonthLabel}
              value={kpi.m3PerAbone != null ? nf.format(kpi.m3PerAbone) : "—"}
            />
            <KpiCard
              title="Toplam elektrik tah."
              subtitle={
                elektrikDonem?.yilOk
                  ? `${isYearly ? "yıllık" : selectedMonthLabel}${ilce ? ` · ${ilce}` : ""}`
                  : `${selectedYear} plan · elektrik henüz yok`
              }
              value={
                elektrikDonem?.toplamTahakkuk != null
                  ? `${nf.format(elektrikDonem.toplamTahakkuk)} ₺`
                  : elektrik
                    ? `${nf.format(elektrik.toplamElektrikTahakkuku)} ₺`
                    : "—"
              }
              valueCompact
            />
            <KpiCard
              title="Net gelir"
              subtitle="su tah. − elektrik tah. (üst filtreler)"
              value={
                elektrikDonem?.netGelir != null
                  ? `${nf.format(elektrikDonem.netGelir)} ₺`
                  : elektrik
                    ? `${nf.format(elektrik.netGelir)} ₺`
                    : "—"
              }
              valueCompact
            />
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedYear}</span> yılı için henüz veri yüklenmedi.
          </p>
        )}
      </div>

      {/* ── ANA LAYOUT: SİDEBAR + İÇERİK ── */}
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-52 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`rounded-lg px-4 py-3 text-left text-sm font-medium transition ${
                activeSection === s.id
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </aside>

        {/* Sağ: mobil nav + içerik */}
        <div className="min-w-0 flex-1">
          {/* Mobil yatay nav */}
          <nav className="flex overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeSection === s.id
                    ? "bg-sky-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* İÇERİK */}
          <div className="p-4 md:p-6">
            {aboneSekmesiBos ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                <p className="text-2xl">📂</p>
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {selectedYear} yılı için abone / su tüketim verisi yok
                </p>
                <p className="max-w-md text-sm text-zinc-500">
                  Altyapı Hatları ve Elektrik Özeti sekmelerine geçebilirsiniz. Hat
                  uzunluğu için yılı &quot;Altyapı Hatları&quot; içindeki seçicide
                  seçin; elektrik için detay{" "}
                  <strong>ay</strong> filtresiyle {dataYear} dosyasından gelir.
                </p>
              </div>
            ) : (
            <>
            {/* ── ÖZET ── */}
            {activeSection === "ozet" && (
              <div className="flex flex-col gap-6">
                <ChartCard title="Aylık metreküp (M³) tüketimi">
                  <ResponsiveContainer width="100%" height={300}>
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
                          nf0.format(
                            typeof value === "number" ? value : Number(value)
                          )
                        }
                        contentStyle={{
                          borderRadius: 8,
                          background: "var(--background)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--foreground)",
                        }}
                        labelStyle={{
                          color: "var(--foreground)",
                          fontWeight: 600,
                        }}
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
                  <ResponsiveContainer width="100%" height={300}>
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
                          nf.format(
                            typeof value === "number" ? value : Number(value)
                          )
                        }
                        contentStyle={{
                          borderRadius: 8,
                          background: "var(--background)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--foreground)",
                        }}
                        labelStyle={{
                          color: "var(--foreground)",
                          fontWeight: 600,
                        }}
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
              </div>
            )}

            {/* ── MUHTAR İLETİŞİM ── */}
            {activeSection === "muhtar" && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Sayfa1: muhtar ve telefon. Tahakkuk seçilen aya göre. Arama:
                  ilçe, mahalle, muhtar, telefon, defter no.
                </p>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <span className="sr-only">Tabloda ara</span>
                  <input
                    type="search"
                    value={muhtarAra}
                    onChange={(e) => setMuhtarAra(e.target.value)}
                    placeholder="İlçe, mahalle, muhtar, telefon…"
                    className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  {defterSatirlari.length} / {filtered.length} satır
                </p>
                <div className="max-h-[min(32rem,75vh)] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                      <tr>
                        {[
                          "Defter",
                          "İlçe",
                          "Mahalle",
                          "Muhtar",
                          "Telefon",
                          "Abone",
                          isYearly
                            ? "Tahakkuk (Yıllık, TL)"
                            : `Tahakkuk (${selectedMonthLabel}, TL)`,
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {defterSatirlari.map((r, idx) => {
                          const tah = recordTahakkukDönem(
                            r,
                            isYearly ? "yillik" : "aylik",
                            isYearly ? 0 : monthIndex
                          );
                        return (
                          <tr
                            key={`${r.defterNo}-${r.ilce}-${r.mahalle}-${idx}`}
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
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                              {r.telefon?.trim() ? r.telefon : "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                              {r.abone > 0 ? nf0.format(r.abone) : "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                              {r.abone > 0 ? nf.format(tah) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SU ALTYAPI ENVANTERİ ── */}
            {activeSection === "altyapi" && (
              <div
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
                >
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      Su altyapı envanteri
                    </h2>
                    {kaynakCounts && (
                      <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                        Kaynak: {kaynakCounts.kaynak} · Depo:{" "}
                        {kaynakCounts.depo} · Terfi: {kaynakCounts.terfi}
                      </p>
                    )}
                  </div>
                  <ChevronIcon
                    open={kaynakPanelOpen}
                    color="text-emerald-600 dark:text-emerald-400"
                  />
                </button>

                <div className={kaynakPanelOpen ? "mt-3" : "hidden"}>
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-500">
                    Veri.xlsx, <strong>KAYNAK-TERFİ-DEPO</strong> sayfası;
                    seçili ilçe/mahalle defterleriyle eşleşen adlar (benzersiz
                    liste). Üstteki yıl bu listeyi değiştirmez. Hat uzunluğu yılı{" "}
                    <strong>Altyapı Hatları</strong> sekmesindedir; elektrikte dönem{" "}
                    <strong>ay</strong> seçimidir.
                  </p>
                  {kaynakOzeti ? (
                    <div className="flex flex-col gap-3 text-zinc-800 dark:text-zinc-200">
                      {kaynakOzeti.depo && (
                        <OzetiBlock label="Depo adı" text={kaynakOzeti.depo} />
                      )}
                      {kaynakOzeti.kaynak && (
                        <OzetiBlock
                          label="Kaynak adı"
                          text={kaynakOzeti.kaynak}
                        />
                      )}
                      {kaynakOzeti.terfi && (
                        <OzetiBlock
                          label="İçme suyu terfi"
                          text={kaynakOzeti.terfi}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-zinc-500 dark:text-zinc-500">
                      Bu seçim için KAYNAK-TERFİ-DEPO eşleşmesi yok.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── ALTYAPI HAT UZUNLUKLARI ── */}
            {activeSection === "hatlar" && (
              <div className="flex flex-col gap-4">
                {!hatUzunluklari ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    Hat uzunluğu verisi bulunamadı. Excel&apos;de{" "}
                    <strong>İçme Suyu / Kanalizasyon / Yağmur Suyu Hat Uzunluğu</strong>{" "}
                    sayfaları ve <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run data</code>{" "}
                    gerekir.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      Kaynak:{" "}
                      <strong>{hatUzunluklari.sheets.icmeSuyu}</strong>,{" "}
                      <strong>{hatUzunluklari.sheets.kanalizasyon}</strong>,{" "}
                      <strong>{hatUzunluklari.sheets.yagmurSuyu}</strong>. Hat uzunluğu
                      Excel&apos;de <strong>yıl</strong> sütunlarındaki işletme + yatırım
                      eklemelerine göredir (üstteki 2025/2026 abone plan yılından
                      bağımsız). <strong>İlçe</strong> üst filtreyle daraltılır.
                      Kümülatif Excel toplamı tabloda referans sütunlarında durur.
                    </p>
                    {hatYillarList.length > 0 && (
                      <label className="flex max-w-[220px] flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Hat tablosu yılı (Excel)
                        <select
                          className={selectCls}
                          value={hatEnvYili}
                          onChange={(e) => setHatEnvYili(Number(e.target.value))}
                        >
                          {hatYillarList.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {hatYilOzet && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <MiniKpi
                          label={`İçme · ${hatEnvYili} eklenen (m)`}
                          value={`${formatMetreCell(hatYilOzet.icme.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`İçme · işl. / yat. % (${hatEnvYili})`}
                          value={
                            hatYilOzet.icme.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.icme.isletmeYuzde)} / % ${nf1.format(hatYilOzet.icme.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                        <MiniKpi
                          label={`Kanal · ${hatEnvYili} eklenen (m)`}
                          value={`${formatMetreCell(hatYilOzet.kanal.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`Kanal · işl. / yat. % (${hatEnvYili})`}
                          value={
                            hatYilOzet.kanal.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.kanal.isletmeYuzde)} / % ${nf1.format(hatYilOzet.kanal.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                        <MiniKpi
                          label={`Yağmur · ${hatEnvYili} eklenen (m)`}
                          value={`${formatMetreCell(hatYilOzet.yagmur.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`Yağmur · işl. / yat. % (${hatEnvYili})`}
                          value={
                            hatYilOzet.yagmur.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.yagmur.isletmeYuzde)} / % ${nf1.format(hatYilOzet.yagmur.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                      </div>
                    )}
                    <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                      Kümülatif (Excel &quot;toplam&quot; sütunu, tüm zamanlar): içme{" "}
                      {formatMetreCell(hatUzunluklari.ozet.icmeSuyuMetre)} m · kanal{" "}
                      {formatMetreCell(hatUzunluklari.ozet.kanalizasyonMetre)} m · yağmur{" "}
                      {formatMetreCell(hatUzunluklari.ozet.yagmurSuyuMetre)} m
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                              İlçe
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme ({hatEnvYili}) m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme işl. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme yat. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal ({hatEnvYili}) m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal işl. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal yat. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Yağmur ({hatEnvYili}) m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Yağmur işl. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Yağmur yat. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kum. içme m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kum. kanal m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kum. yağmur m
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(hatYilOzet?.rows ?? hatUzunluklari.ilceler).map((row) => {
                            const ic = hatHucreYilOzeti(row.icmeSuyu, hatEnvYili);
                            const ka = hatHucreYilOzeti(row.kanalizasyon, hatEnvYili);
                            const ya = hatHucreYilOzeti(row.yagmurSuyu, hatEnvYili);
                            return (
                              <tr
                                key={row.ilce}
                                className="border-b border-zinc-100 dark:border-zinc-800/80"
                              >
                                <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                                  {row.ilce}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {formatMetreCell(ic.ekMetre)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ic.isletmeYuzde != null
                                    ? `% ${nf1.format(ic.isletmeYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ic.yatirimYuzde != null
                                    ? `% ${nf1.format(ic.yatirimYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {formatMetreCell(ka.ekMetre)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ka.isletmeYuzde != null
                                    ? `% ${nf1.format(ka.isletmeYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ka.yatirimYuzde != null
                                    ? `% ${nf1.format(ka.yatirimYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {formatMetreCell(ya.ekMetre)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ya.isletmeYuzde != null
                                    ? `% ${nf1.format(ya.isletmeYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {ya.yatirimYuzde != null
                                    ? `% ${nf1.format(ya.yatirimYuzde)}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                  {formatMetreCell(row.icmeSuyu?.toplam ?? null)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                  {formatMetreCell(row.kanalizasyon?.toplam ?? null)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                  {formatMetreCell(row.yagmurSuyu?.toplam ?? null)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── İLÇE BAZLI OKUMA ── */}
            {activeSection === "ilce" && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  <strong>
                    {isYearly ? `${dataYear} Yıllık Toplam` : `${selectedMonthLabel} ${dataYear}`}
                  </strong>{" "}
                  verisi. Tüm defterler üzerinden ilçe bazında toplanır
                  (mahalle filtresi bu tabloyu daraltmaz).
                </p>

                {/* Toplam KPI bandı */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
                    label="Okunamayan Abone"
                    value={`% ${nf1.format(ilcePerformansResult.toplam.okunamayanYuzde)}`}
                  />
                  <MiniKpi
                    label="Faturalama Başarısı"
                    value={`% ${nf1.format(ilcePerformansResult.toplam.faturaBasarisi)}`}
                  />
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                        {[
                          "Sıra",
                          "İlçe",
                          "Σ Abone",
                          "Σ Okuma",
                          "Okuma %",
                          "Okunamayan %",
                          "Fatura Adedi",
                          "Faturalama %",
                        ].map((h, idx) => (
                          <th
                            key={h}
                            className={`px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300 ${idx >= 2 ? "text-right" : ""}`}
                          >
                            {h}
                          </th>
                        ))}
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
                      <IlcePerformansTotalRow
                        toplam={ilcePerformansResult.toplam}
                      />
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── ELEKTRİK ÖZETİ ── */}
            {activeSection === "elektrik" && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Elektrik tüketim/tahakkuk: Excel&apos;deki <strong>aylık kWh ve TL</strong>{" "}
                  sütunlarından gelir; dönem seçimi üstteki <strong>ay</strong> filtresidir.
                  Üstteki <strong>yıl</strong> ({dataYear} / {dataYear + 1}) abone ve su
                  tarafı içindir — elektrik sayfaları şimdilik yalnızca{" "}
                  <strong>{dataYear}</strong> dosyasındadır. <strong>İlçe</strong> ile
                  daraltılır. Su tahakkuku ve net gelir, aynı ay ve coğrafi filtredeki
                  abone tahakkukunu kullanır.
                  {!elektrikDonem?.yilOk && (
                    <span className="block pt-1 font-medium text-amber-700 dark:text-amber-400">
                      {selectedYear} plan yılı seçili: Excel&apos;e bu yıl için elektrik
                      sayfaları eklendiğinde burada görünecek; şu an veri yok (boş
                      görünmesi normal).
                    </span>
                  )}
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniKpi
                    label="Toplam Elektrik Tüketimi"
                    value={
                      elektrikDonem?.toplamKwh != null
                        ? `${nf0.format(elektrikDonem.toplamKwh)} kWh`
                        : elektrik
                          ? `${nf0.format(elektrik.toplamElektrikTuketimiKwh)} kWh`
                          : "—"
                    }
                  />
                  <MiniKpi
                    label="Toplam Elektrik Tahakkuku"
                    value={
                      elektrikDonem?.toplamTahakkuk != null
                        ? `${nf.format(elektrikDonem.toplamTahakkuk)} ₺`
                        : elektrik
                          ? `${nf.format(elektrik.toplamElektrikTahakkuku)} ₺`
                          : "—"
                    }
                  />
                  <MiniKpi
                    label="Toplam Su Tahakkuku"
                    value={
                      elektrikDonem?.suTahakkuku != null
                        ? `${nf.format(elektrikDonem.suTahakkuku)} ₺`
                        : elektrik
                          ? `${nf.format(elektrik.toplamSuTahakkuku)} ₺`
                          : "—"
                    }
                  />
                  <MiniKpi
                    label="Net Gelir"
                    value={
                      elektrikDonem?.netGelir != null
                        ? `${nf.format(elektrikDonem.netGelir)} ₺`
                        : elektrik
                          ? `${nf.format(elektrik.netGelir)} ₺`
                          : "—"
                    }
                  />
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                        <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                          Birim
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Elektrik Tüketimi (kWh)
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Elektrik Tahakkuku (TL)
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Kayıt Sayısı
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(elektrikDonem?.detayTablo ?? []).map((d) => (
                        <tr
                          key={d.label}
                          className="border-b border-zinc-100 dark:border-zinc-800/80"
                        >
                          <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                            {d.label}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                            {d.kwh != null ? nf0.format(d.kwh) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                            {d.tahakkuk != null ? nf.format(d.tahakkuk) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                            {d.countOut != null ? nf0.format(d.countOut) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                        <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                          İlçe
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Toplam kWh
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Toplam TL
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Yağmur kWh
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          Kanalizasyon kWh
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          İçme Suyu kWh
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {elektrikDonem?.yilOk === false ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                          >
                            İlçe kırılımı için üstte <strong>{dataYear}</strong> yılını
                            seçin. {selectedYear} planında henüz elektrik Excel verisi
                            yok.
                          </td>
                        </tr>
                      ) : (
                        (elektrikDonem?.ilceTablo ?? []).map((d) => (
                          <tr
                            key={d.ilce}
                            className="border-b border-zinc-100 dark:border-zinc-800/80"
                          >
                            <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {d.ilce}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {nf0.format(d.toplamKwh)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {nf.format(d.toplamTahakkuk)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {nf0.format(d.yagmurKwh)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {nf0.format(d.kanalizasyonKwh)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {nf0.format(d.icmeKwh)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </div>
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
      className={`h-5 w-5 shrink-0 ${color} transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
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
      <td
        className={`px-3 py-2 text-right tabular-nums font-medium ${
          row.okunamayanYuzde > 10
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {nf1.format(row.okunamayanYuzde)}
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
        {nf1.format(toplam.okunamayanYuzde)}
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
    return items.filter((item) => item.toLocaleLowerCase("tr-TR").includes(q));
  }, [items, query]);

  useEffect(() => {
    setQuery("");
  }, [text]);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        {label}
        {items.length > 0 && (
          <span className="ml-2 font-normal normal-case text-zinc-500">
            ({items.length} kayıt)
            {query.trim() && (
              <span className="text-emerald-700 dark:text-emerald-400">
                {" "}
                · {filtered.length} eşleşme
              </span>
            )}
          </span>
        )}
      </p>
      {items.length > 0 && (
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
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      )}
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
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p
        className={`mt-1.5 min-w-0 max-w-full break-all font-semibold tabular-nums leading-snug text-zinc-900 dark:text-zinc-50 ${
          valueCompact ? "text-sm sm:text-base" : "text-base sm:text-lg"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-zinc-500">{subtitle}</p>
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
      <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {children}
    </div>
  );
}
