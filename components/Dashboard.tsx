"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
  MesaiDataSheet,
  MesaiIlceSatiri,
  MesaiSubeSatiri,
} from "@/lib/dashboard";
import {
  aggregateMesaiByAy,
  aggregateMesaiByIlce,
  collectDaireSubeOptions,
  filterMesaiDataSheetRows,
  resolveMesaiSheetColumns,
  resolveTutarColumn,
  type MesaiSheetFilters,
  type MesaiTurFiltre,
} from "@/lib/mesai-data-sheet";

/** Hat tablosu: tüm yılların işletme+yatırım eklemesi (Excel satır toplamı) */
const HAT_YIL_TUMU = "tumu" as const;
type HatYilSecimi = number | typeof HAT_YIL_TUMU;

function hatSatirOzeti(
  h: HatUzunlukHucre | null,
  yil: HatYilSecimi,
  mevcutKovasiYili: number | null
) {
  if (yil === HAT_YIL_TUMU) return hatHucreTumYillarOzeti(h);
  return hatHucreYilOzeti(h, yil, mevcutKovasiYili);
}
import {
  aggregate,
  aggregateKanalHatVarYok,
  collectKaynakDepoSummary,
  computeIlcePerformans,
  elektrikDetayDonemToplam,
  elektrikDetayIlceDonem,
  elektrikDetayKonumDonem,
  filterRecords,
  yakitTahakkukuForPeriod,
  hatHucreTumYillarOzeti,
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
/** Mesai histogram: üstte etiket alanı (okunabilir tutar) */
const mesaiChartMargin = { top: 28, right: 16, left: 28, bottom: 12 } as const;
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

type SectionId =
  | "ozet"
  | "muhtar"
  | "altyapi"
  | "hatlar"
  | "ilce"
  | "elektrik"
  | "yakit"
  | "mesai";

const NAV_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "muhtar", label: "Muhtar İletişim" },
  { id: "altyapi", label: "Su Altyapı Envanteri" },
  { id: "hatlar", label: "Altyapı Hatları" },
  { id: "ilce", label: "İlçe Bazlı Okuma" },
  { id: "elektrik", label: "Elektrik Özeti" },
  { id: "yakit", label: "Yakıt Özeti" },
  { id: "mesai", label: "Mesai Özeti" },
];

type Props = { data: DashboardPayload };

/** Üst filtrelerle uyumlu mesai tutarı (ilçe seçiliyse o ilçe; mahalle Excel’de yok). */
function mesaiGiderTutar(
  mesai: DashboardPayload["mesai"],
  selectedYear: number,
  monthIndex: number,
  ilceFilter: string
): number {
  if (!mesai?.aylik?.length) return 0;
  if (selectedYear !== mesai.dataYear) return 0;
  const aylar =
    monthIndex === -1 ? mesai.aylik : mesai.aylik.filter((a) => a.ay === monthIndex);
  let sum = 0;
  for (const ay of aylar) {
    for (const row of ay.ilceler) {
      if (ilceFilter && row.ilce !== ilceFilter) continue;
      sum += row.genelToplamTutar;
    }
  }
  return sum;
}

export default function Dashboard({ data }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("ozet");
  const [ilce, setIlce] = useState("");
  const [mahalle, setMahalle] = useState("");
  /** -1 = Tümü (yıllık toplam), 0–11 = ay indeksi */
  const [monthIndex, setMonthIndex] = useState<number>(-1);
  const [muhtarAra, setMuhtarAra] = useState("");
  /** Yakıt Özeti tablosu: yalnızca bu sekme; üstteki su/abone ilçe filtresinden bağımsız */
  const [yakitIlceFiltre, setYakitIlceFiltre] = useState("");
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
  const [hatEnvYili, setHatEnvYili] = useState<HatYilSecimi>(HAT_YIL_TUMU);

  useEffect(() => {
    if (hatEnvYili === HAT_YIL_TUMU) return;
    if (!hatYillarList.length) {
      setHatEnvYili(HAT_YIL_TUMU);
      return;
    }
    if (!hatYillarList.includes(hatEnvYili as number)) {
      setHatEnvYili(HAT_YIL_TUMU);
    }
  }, [hatYillarList, hatEnvYili]);

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

  const mesaiUstFiltre = useMemo(
    () => mesaiGiderTutar(data.mesai, selectedYear, monthIndex, ilce),
    [data.mesai, selectedYear, monthIndex, ilce]
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
  const hatMevcutKovasiYili = data.hatUzunluklari?.mevcutKovasiYili ?? null;

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
      const detayBos = e.detay.map((d) => ({
        key: d.key,
        label: d.label,
        kwh: null as number | null,
        tahakkuk: null as number | null,
        countOut: null as number | null,
      }));
      return {
        yilOk: false,
        detayTablo: detayBos,
        toplamKwh: null as number | null,
        toplamTahakkuk: null as number | null,
        yakitTahakkuk: null as number | null,
        mesaiGider: null as number | null,
        toplamGider: null as number | null,
        netGelir: null as number | null,
        ilceTablo: [] as Array<{
          ilce: string;
          mahalle?: string;
          toplamKwh: number;
          toplamTahakkuk: number;
          yagmurKwh: number;
          kanalizasyonKwh: number;
          icmeKwh: number;
        }>,
      };
    }

    let detayTablo = e.detay.map((d) => {
      const v =
        ilce.trim() && mahalle.trim()
          ? elektrikDetayKonumDonem(d, ilce, mahalle, isYearly, monthIndex)
          : ilce.trim()
            ? elektrikDetayIlceDonem(d, ilce, isYearly, monthIndex)
            : elektrikDetayDonemToplam(d, isYearly, monthIndex);
      const countOut =
        ilce.trim() && mahalle.trim()
          ? elektrikDetayKonumDonem(d, ilce, mahalle, isYearly, monthIndex).count
          : ilce.trim()
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
    const yakitTah = yakitTahakkukuForPeriod(data.yakit, selectedYear, ilce);
    const mesaiTah = mesaiGiderTutar(data.mesai, selectedYear, monthIndex, ilce);
    const toplamGider = toplamTah + yakitTah + mesaiTah;
    const netGelir = suTah - toplamGider;

    const ilceListe = ilce.trim()
      ? [ilce]
      : (e.ilceDetay?.map((r) => r.ilce) ?? data.ilceler);

    let ilceTablo: Array<{
      ilce: string;
      mahalle?: string;
      toplamKwh: number;
      toplamTahakkuk: number;
      yagmurKwh: number;
      kanalizasyonKwh: number;
      icmeKwh: number;
    }>;

    if (ilce.trim() && mahalle.trim()) {
      const y = elektrikDetayKonumDonem(yDet, ilce, mahalle, isYearly, monthIndex);
      const k = elektrikDetayKonumDonem(kDet, ilce, mahalle, isYearly, monthIndex);
      const ic = elektrikDetayKonumDonem(iDet, ilce, mahalle, isYearly, monthIndex);
      ilceTablo = [
        {
          ilce,
          mahalle,
          toplamKwh: y.kwh + k.kwh + ic.kwh,
          toplamTahakkuk: y.tahakkuk + k.tahakkuk + ic.tahakkuk,
          yagmurKwh: y.kwh,
          kanalizasyonKwh: k.kwh,
          icmeKwh: ic.kwh,
        },
      ];
    } else {
      ilceTablo = ilceListe.map((ilceAdi) => {
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
    }

    return {
      yilOk,
      detayTablo,
      toplamKwh,
      toplamTahakkuk: toplamTah,
      yakitTahakkuk: yakitTah,
      mesaiGider: mesaiTah,
      toplamGider,
      netGelir,
      ilceTablo,
    };
  }, [
    data.elektrik,
    data.yakit,
    data.mesai,
    data.ilceler,
    dataYear,
    selectedYear,
    ilce,
    mahalle,
    isYearly,
    monthIndex,
    kpi.totalTahakkuk,
  ]);

  /** Hat uzunlukları: Excel takvim yılı veya tüm yıllar + ilçe */
  const hatYilOzet = useMemo(() => {
    const h = data.hatUzunluklari;
    if (!h?.ilceler?.length) return null;
    const mk = h.mevcutKovasiYili ?? null;
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
      let ek = 0;
      for (const row of rows) {
        const o = hatSatirOzeti(pick(row), hatEnvYili, mk);
        is += o.isletme;
        ya += o.yatirim;
        ek += o.ekMetre;
      }
      const ext = is + ya;
      return {
        ekMetre: ek,
        isletmeYuzde: ext > 0 ? (is / ext) * 100 : null,
        yatirimYuzde: ext > 0 ? (ya / ext) * 100 : null,
      };
    };

    return {
      rows,
      icme: toplaTip((r) => r.icmeSuyu),
      kanal: toplaTip((r) => r.kanalizasyon),
      yagmur: toplaTip((r) => r.yagmurSuyu),
    };
  }, [data.hatUzunluklari, ilce, hatEnvYili]);

  /** Tablo altı: kümülatif sütunları için görünen satırların toplamı */
  const hatTabloKumToplam = useMemo(() => {
    if (!hatYilOzet) return null;
    return hatYilOzet.rows.reduce(
      (acc, row) => ({
        ic: acc.ic + (row.icmeSuyu?.toplam ?? 0),
        ka: acc.ka + (row.kanalizasyon?.toplam ?? 0),
        ya: acc.ya + (row.yagmurSuyu?.toplam ?? 0),
      }),
      { ic: 0, ka: 0, ya: 0 }
    );
  }, [hatYilOzet]);

  const kanalVarYokOzet = useMemo(
    () => aggregateKanalHatVarYok(data.kanalHatVarYok ?? null, ilce, mahalle),
    [data.kanalHatVarYok, ilce, mahalle]
  );

  const yakitIlceSecenekleri = useMemo(() => {
    if (!data.yakit?.byIlce) return [];
    return Object.keys(data.yakit.byIlce)
      .filter((x) => x !== "TOPLAM")
      .sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [data.yakit?.byIlce]);

  useEffect(() => {
    if (!data.yakit?.byIlce || !yakitIlceFiltre) return;
    const valid = Object.keys(data.yakit.byIlce).filter((k) => k !== "TOPLAM");
    if (!valid.includes(yakitIlceFiltre)) setYakitIlceFiltre("");
  }, [data.yakit?.byIlce, yakitIlceFiltre]);

  const yakitOzetiGorunumu = useMemo(() => {
    if (!data.yakit) return null;
    return getYakitIlceView(data.yakit, yakitIlceFiltre);
  }, [data.yakit, yakitIlceFiltre]);

  const aboneSekmesiBos =
    !hasDataForYear &&
    (activeSection === "ozet" ||
      activeSection === "muhtar" ||
      activeSection === "altyapi" ||
      activeSection === "ilce");

  const hatYilBaslik =
    hatEnvYili === HAT_YIL_TUMU
      ? "Tümü"
      : hatMevcutKovasiYili != null && hatEnvYili === hatMevcutKovasiYili
        ? `${hatMevcutKovasiYili} (mevcut)`
        : `${hatEnvYili}`;

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

      {/* ── FİLTRELER ── (yıl/ay üstte; coğrafi filtreler altta — müşteri notu) */}
      <div className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3">
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
              title="Elektrik ve mesai özetleri Excel’deki aya göre; su tahakkuku bu ayla uyumludur."
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

          <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
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
          </div>
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
              title="Toplam gider"
              subtitle={
                elektrikDonem?.yilOk
                  ? `elektrik + yakıt + mesai tah. · ${isYearly ? "yıllık" : selectedMonthLabel}${ilce ? ` · ${ilce}` : ""}${mahalle ? " · mesai ilçe toplamı" : ""}`
                  : `${selectedYear} plan · henüz tam veri yok`
              }
              hint={
                elektrikDonem?.yilOk &&
                elektrikDonem.toplamTahakkuk != null &&
                elektrikDonem.yakitTahakkuk != null &&
                elektrikDonem.mesaiGider != null
                  ? `Elektrik tah.: ${nf.format(elektrikDonem.toplamTahakkuk)} ₺ · Yakıt: ${nf.format(elektrikDonem.yakitTahakkuk)} ₺ · Mesai: ${nf.format(elektrikDonem.mesaiGider)} ₺`
                  : undefined
              }
              value={
                elektrikDonem?.toplamGider != null
                  ? `${nf.format(elektrikDonem.toplamGider)} ₺`
                  : (() => {
                      const eTah = data.elektrik?.toplamElektrikTahakkuku ?? 0;
                      const yTah = yakitTahakkukuForPeriod(
                        data.yakit,
                        selectedYear,
                        ilce
                      );
                      const mTah = mesaiUstFiltre;
                      if (!data.elektrik && !data.yakit && mTah === 0) return "—";
                      return `${nf.format(eTah + yTah + mTah)} ₺`;
                    })()
              }
              valueCompact
            />
            <KpiCard
              title="Net gelir"
              subtitle="su tah. − (elektrik + yakıt + mesai) — üst yıl/ay/ilçe"
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
                    <label className="flex max-w-[280px] flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Hat tablosu (Excel yılı veya tümü)
                      <select
                        className={selectCls}
                        value={hatEnvYili === HAT_YIL_TUMU ? "tumu" : hatEnvYili}
                        onChange={(e) => {
                          const v = e.target.value;
                          setHatEnvYili(v === "tumu" ? HAT_YIL_TUMU : Number(v));
                        }}
                      >
                        <option value="tumu">Tümü (tüm yıllar eklemesi)</option>
                        {hatMevcutKovasiYili != null && (
                          <option value={hatMevcutKovasiYili}>
                            {hatMevcutKovasiYili} (mevcut hat, Excel &quot;&lt; 2013&quot;)
                          </option>
                        )}
                        {hatYillarList
                          .filter((y) => y !== hatMevcutKovasiYili)
                          .map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                      </select>
                    </label>
                    {hatYilOzet && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <MiniKpi
                          label={`İçme · ${hatYilBaslik} (m)`}
                          value={`${formatMetreCell(hatYilOzet.icme.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`İçme · işl. / yat. % (${hatYilBaslik})`}
                          value={
                            hatYilOzet.icme.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.icme.isletmeYuzde)} / % ${nf1.format(hatYilOzet.icme.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                        <MiniKpi
                          label={`Kanal · ${hatYilBaslik} (m)`}
                          value={`${formatMetreCell(hatYilOzet.kanal.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`Kanal · işl. / yat. % (${hatYilBaslik})`}
                          value={
                            hatYilOzet.kanal.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.kanal.isletmeYuzde)} / % ${nf1.format(hatYilOzet.kanal.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                        <MiniKpi
                          label={`Yağmur · ${hatYilBaslik} (m)`}
                          value={`${formatMetreCell(hatYilOzet.yagmur.ekMetre)} m`}
                        />
                        <MiniKpi
                          label={`Yağmur · işl. / yat. % (${hatYilBaslik})`}
                          value={
                            hatYilOzet.yagmur.isletmeYuzde != null
                              ? `% ${nf1.format(hatYilOzet.yagmur.isletmeYuzde)} / % ${nf1.format(hatYilOzet.yagmur.yatirimYuzde ?? 0)}`
                              : "—"
                          }
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Genel toplam — kümülatif hat (Excel &quot;Toplam&quot; sütunu; tüm
                        ilçelerin satır toplamları; mevcut hat + yıllık eklemeler)
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <MiniKpi
                          label="Toplam içme hattı (kümülatif, m)"
                          value={`${formatMetreCell(hatUzunluklari.ozet.icmeSuyuMetre)} m`}
                        />
                        <MiniKpi
                          label="Toplam kanal hattı (kümülatif, m)"
                          value={`${formatMetreCell(hatUzunluklari.ozet.kanalizasyonMetre)} m`}
                        />
                        <MiniKpi
                          label="Toplam yağmur hattı (kümülatif, m)"
                          value={`${formatMetreCell(hatUzunluklari.ozet.yagmurSuyuMetre)} m`}
                        />
                      </div>
                      {ilce.trim() ? (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                          Üstteki üç değer <strong>tüm ilçeler</strong> içindir. Tablo ve
                          alttaki <strong>TOPLAM</strong> satırı seçili ilçeyi gösterir.
                        </p>
                      ) : null}
                    </div>
                    {data.kanalHatVarYok && (
                      <div className="rounded-lg border border-sky-200 bg-sky-50/90 p-3 dark:border-sky-900/50 dark:bg-sky-950/30">
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Kanalizasyon hattı VAR / YOK — nüfus payı
                        </h3>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                          Kaynak: Excel <strong>{data.kanalHatVarYok.sheetLabel}</strong>{" "}
                          (mahalle satırı, plan nüfus sütunu ve VAR/YOK). Yüzdeler, üstteki
                          ilçe/mahalle filtresine uyan satırların <strong>nüfus toplamı</strong>{" "}
                          üzerinden hesaplanır; bu nüfus <strong>NÜFUS</strong> sayfasındaki
                          TÜİK nüfusundan farklı olabilir.
                        </p>
                        {kanalVarYokOzet && kanalVarYokOzet.toplamNufus > 0 ? (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[440px] border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-sky-200 dark:border-sky-800">
                                  <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                                    Durum
                                  </th>
                                  <th className="px-2 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                    Nüfus
                                  </th>
                                  <th className="px-2 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                    Nüfus %
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-sky-100 dark:border-sky-900/40">
                                  <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                                    VAR
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                    {nf0.format(kanalVarYokOzet.varNufus)}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                    {kanalVarYokOzet.varYuzde != null
                                      ? `% ${nf1.format(kanalVarYokOzet.varYuzde)}`
                                      : "—"}
                                  </td>
                                </tr>
                                <tr className="border-b border-sky-100 dark:border-sky-900/40">
                                  <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                                    YOK
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                    {nf0.format(kanalVarYokOzet.yokNufus)}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                    {kanalVarYokOzet.yokYuzde != null
                                      ? `% ${nf1.format(kanalVarYokOzet.yokYuzde)}`
                                      : "—"}
                                  </td>
                                </tr>
                                {kanalVarYokOzet.kismiNufus > 0 ? (
                                  <tr className="border-b border-sky-100 dark:border-sky-900/40">
                                    <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                                      Kısmi
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                      {nf0.format(kanalVarYokOzet.kismiNufus)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                      {kanalVarYokOzet.kismiYuzde != null
                                        ? `% ${nf1.format(kanalVarYokOzet.kismiYuzde)}`
                                        : "—"}
                                    </td>
                                  </tr>
                                ) : null}
                                {kanalVarYokOzet.digerNufus > 0 ? (
                                  <tr className="border-b border-sky-100 dark:border-sky-900/40">
                                    <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                                      Diğer etiket
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                      {nf0.format(kanalVarYokOzet.digerNufus)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                      {kanalVarYokOzet.digerYuzde != null
                                        ? `% ${nf1.format(kanalVarYokOzet.digerYuzde)}`
                                        : "—"}
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-sky-300 font-semibold text-zinc-900 dark:border-sky-700 dark:text-zinc-100">
                                  <td className="px-2 py-2">Toplam</td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    {nf0.format(kanalVarYokOzet.toplamNufus)}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    % 100
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                              {kanalVarYokOzet.satirSayisi} satır (mahalle) · Sayfadaki
                              abone toplamı: {nf0.format(kanalVarYokOzet.toplamAbone)}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                            Bu seçim için VAR–YOK tablosunda satır yok veya nüfus
                            girilmemiş.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                              İlçe
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme ({hatYilBaslik}) m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme işl. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              İçme yat. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal ({hatYilBaslik}) m
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal işl. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Kanal yat. %
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              Yağmur ({hatYilBaslik}) m
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
                            const ic = hatSatirOzeti(
                              row.icmeSuyu,
                              hatEnvYili,
                              hatMevcutKovasiYili
                            );
                            const ka = hatSatirOzeti(
                              row.kanalizasyon,
                              hatEnvYili,
                              hatMevcutKovasiYili
                            );
                            const ya = hatSatirOzeti(
                              row.yagmurSuyu,
                              hatEnvYili,
                              hatMevcutKovasiYili
                            );
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
                        {hatYilOzet && hatTabloKumToplam && (
                          <tfoot>
                            <tr className="border-t-2 border-zinc-300 bg-zinc-100 font-semibold dark:border-zinc-600 dark:bg-zinc-900">
                              <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                                TOPLAM
                                {ilce.trim() ? (
                                  <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                                    (seçili ilçe)
                                  </span>
                                ) : (
                                  <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                                    (tüm ilçeler)
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {formatMetreCell(hatYilOzet.icme.ekMetre)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.icme.isletmeYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.icme.isletmeYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.icme.yatirimYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.icme.yatirimYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {formatMetreCell(hatYilOzet.kanal.ekMetre)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.kanal.isletmeYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.kanal.isletmeYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.kanal.yatirimYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.kanal.yatirimYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {formatMetreCell(hatYilOzet.yagmur.ekMetre)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.yagmur.isletmeYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.yagmur.isletmeYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                                {hatYilOzet.yagmur.yatirimYuzde != null
                                  ? `% ${nf1.format(hatYilOzet.yagmur.yatirimYuzde)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                {formatMetreCell(hatTabloKumToplam.ic)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                {formatMetreCell(hatTabloKumToplam.ka)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                                {formatMetreCell(hatTabloKumToplam.ya)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
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
                  <strong>{dataYear}</strong> dosyasındadır. Üç elektrik sayfasında{" "}
                  <strong>İLÇE</strong> ve <strong>MAHALLE</strong> sütunları vardır; üst
                  filtrelerdeki ilçe/mahalle ile aynı konum satırları toplanır. Üstteki{" "}
                  <strong>Toplam tahakkuk</strong> ve <strong>Net gelir</strong> (su tah. −{" "}
                  <strong>toplam gider</strong>; giderde <strong>mesai</strong> da dahil) aynı ay ve
                  coğrafi filtredeki abone tahakkukunu kullanır. Mesai tutarı ilçe bazlıdır; mahalle
                  seçili olsa da mesai o ilçenin toplamıdır.
                  {!elektrikDonem?.yilOk && (
                    <span className="block pt-1 font-medium text-amber-700 dark:text-amber-400">
                      {selectedYear} plan yılı seçili: Excel&apos;e bu yıl için elektrik
                      sayfaları eklendiğinde burada görünecek; şu an veri yok (boş
                      görünmesi normal).
                    </span>
                  )}
                </p>

                <div className="grid grid-cols-2 gap-3">
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
                  <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                        <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                          İlçe
                        </th>
                        <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                          Mahalle
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
                            colSpan={7}
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
                            key={`${d.ilce}-${d.mahalle ?? ""}`}
                            className="border-b border-zinc-100 dark:border-zinc-800/80"
                          >
                            <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {d.ilce}
                            </td>
                            <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                              {d.mahalle?.trim() ? d.mahalle : "—"}
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

            {activeSection === "yakit" && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  <strong>Toplam yakıt</strong> = taşıt yakıtı + demirbaş (ör. jeneratör)
                  tahakkuku; kaynak Excel&apos;deki{" "}
                  <strong>İLÇELERE GÖRE YAKIT TAHAKKUKU</strong> özetine göre.{" "}
                  <strong>MERKEZ</strong> diğer ilçelerle aynı şekilde listede yer alır.
                  Tabloyu daraltmak için aşağıdaki ilçe filtresini kullanın. Yıl, dosyadaki
                  icmal yılıyla eşleşmeli ({data.yakit?.yakitYear ?? "—"}).
                </p>
                {!data.yakit ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                    Yakıt icmalı bulunamadı.{" "}
                    <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                      data/2025 YAKIT İCMALİ 1.xlsx
                    </code>{" "}
                    dosyasını ekleyip{" "}
                    <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                      npm run data
                    </code>{" "}
                    çalıştırın veya{" "}
                    <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                      YAKIT_ICMALI_PATH
                    </code>{" "}
                    ile yolu verin.
                  </p>
                ) : selectedYear !== data.yakit.yakitYear ? (
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Yakıt verisi {data.yakit.yakitYear} yılı içindir. Üstte veri yılı
                    olarak {data.yakit.yakitYear} seçin.
                  </p>
                ) : (
                  <>
                    {yakitOzetiGorunumu && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        <MiniKpi
                          label="Toplam taşıt"
                          value={
                            yakitOzetiGorunumu.bosSecim
                              ? "—"
                              : `${nf.format(yakitOzetiGorunumu.totals.tasit)} ₺`
                          }
                        />
                        <MiniKpi
                          label="Toplam demirbaş (diğer)"
                          value={
                            yakitOzetiGorunumu.bosSecim
                              ? "—"
                              : `${nf.format(yakitOzetiGorunumu.totals.demirbas)} ₺`
                          }
                        />
                        <MiniKpi
                          label="Toplam yakıt (özet)"
                          value={
                            yakitOzetiGorunumu.bosSecim
                              ? "—"
                              : `${nf.format(yakitOzetiGorunumu.totals.toplam)} ₺`
                          }
                        />
                      </div>
                    )}
                    <label className="flex w-full max-w-xs flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      İlçe filtresi
                      <select
                        className={selectCls}
                        value={yakitIlceFiltre}
                        onChange={(e) => setYakitIlceFiltre(e.target.value)}
                      >
                        <option value="">Tüm ilçeler</option>
                        {yakitIlceSecenekleri.map((i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </select>
                    </label>
                    {yakitOzetiGorunumu && (
                      <YakitIlceTable
                        yakit={data.yakit}
                        visibleKeys={yakitOzetiGorunumu.visibleKeys}
                      />
                    )}
                  </>
                )}
                {data.yakit && (
                  <p className="text-xs text-zinc-400">
                    Dosya: {data.yakit.sourceFile} · Sayfa: {data.yakit.sheet}
                  </p>
                )}
              </div>
            )}

            {activeSection === "mesai" &&
              (data.mesai ? (
                <MesaiSection
                  mesai={data.mesai}
                  monthIndex={monthIndex}
                  selectedYear={selectedYear}
                  dataYear={dataYear}
                  months={data.months}
                  globalIlce={ilce}
                  setGlobalIlce={setIlce}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                  Mesai verisi bulunamadı.{" "}
                  <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                    data/mesai-2025.xlsx
                  </code>{" "}
                  ekleyip{" "}
                  <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run data</code>{" "}
                  çalıştırın.
                </p>
              ))}
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** İlçe filtresine göre görünen satırlar ve özet toplamlar (üstteki MiniKpi ile paylaşılır) */
function getYakitIlceView(
  yakit: NonNullable<DashboardPayload["yakit"]>,
  ilceFilter: string
) {
  const ilceKeys = Object.keys(yakit.byIlce)
    .filter((x) => x !== "TOPLAM")
    .sort((a, b) => a.localeCompare(b, "tr-TR"));
  const trimmed = ilceFilter.trim();
  const visibleKeys = trimmed
    ? ilceKeys.filter((k) => k === trimmed)
    : ilceKeys;
  let totals: { tasit: number; demirbas: number; toplam: number };
  if (!trimmed) {
    totals = {
      tasit: yakit.toplamTasitTahakkuku,
      demirbas: yakit.toplamDemirbasTahakkuku,
      toplam: yakit.toplamYakitTahakkuku,
    };
  } else {
    totals = visibleKeys.reduce(
      (acc, k) => {
        const row = yakit.byIlce[k];
        if (!row) return acc;
        return {
          tasit: acc.tasit + row.tasitTahakkuku,
          demirbas: acc.demirbas + row.demirbasTahakkuku,
          toplam: acc.toplam + row.toplamYakitTahakkuku,
        };
      },
      { tasit: 0, demirbas: 0, toplam: 0 }
    );
  }
  const bosSecim = Boolean(trimmed && visibleKeys.length === 0);
  return { visibleKeys, totals, bosSecim };
}

function YakitIlceTable({
  yakit,
  visibleKeys,
}: {
  yakit: NonNullable<DashboardPayload["yakit"]>;
  visibleKeys: string[];
}) {
  const nf = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
              İlçe
            </th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
              Taşıt (TL)
            </th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
              Demirbaş (TL)
            </th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
              Toplam yakıt (TL)
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleKeys.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
              >
                Seçilen ilçe için satır yok.
              </td>
            </tr>
          ) : (
            visibleKeys.map((ilceAd) => {
              const row = yakit.byIlce[ilceAd];
              if (!row) return null;
              return (
                <tr
                  key={ilceAd}
                  className="border-b border-zinc-100 dark:border-zinc-800/80"
                >
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {ilceAd}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {nf.format(row.tasitTahakkuku)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {nf.format(row.demirbasTahakkuku)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {nf.format(row.toplamYakitTahakkuku)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── MESAİ BİLEŞENLERİ ─── */

const MESAI_TUR_SEC: { id: MesaiTurFiltre; label: string }[] = [
  { id: "genel", label: "Genel toplam" },
  { id: "fazla", label: "Fazla mesai" },
  { id: "cumartesi", label: "Cumartesi" },
  { id: "haftatatil", label: "Hafta tatili" },
  { id: "bayram", label: "Bayram / resmi tatil" },
];

function MesaiSection({
  mesai,
  monthIndex,
  selectedYear,
  dataYear,
  months,
  globalIlce,
  setGlobalIlce,
}: {
  mesai: NonNullable<DashboardPayload["mesai"]>;
  monthIndex: number;
  selectedYear: number;
  dataYear: number;
  months: string[];
  globalIlce: string;
  setGlobalIlce: (s: string) => void;
}) {
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [daireFiltre, setDaireFiltre] = useState("");
  const [subeFiltre, setSubeFiltre] = useState("");
  const [mesaiTur, setMesaiTur] = useState<MesaiTurFiltre>("genel");
  const [sheetData, setSheetData] = useState<MesaiDataSheet | null>(
    () => (mesai.dataSheet?.rows?.length ? mesai.dataSheet : null)
  );

  useEffect(() => {
    if (sheetData || !mesai.dataSheetUrl) return;
    let cancel = false;
    fetch(mesai.dataSheetUrl)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<MesaiDataSheet>;
      })
      .then((j) => {
        if (!cancel && j?.columns?.length && j.rows) setSheetData(j);
      })
      .catch(() => {
        if (!cancel) setSheetData(null);
      });
    return () => {
      cancel = true;
    };
  }, [mesai.dataSheetUrl, sheetData]);

  useEffect(() => {
    setSubeFiltre("");
  }, [daireFiltre]);

  const sheetCols = useMemo(
    () => (sheetData ? resolveMesaiSheetColumns(sheetData.columns) : null),
    [sheetData]
  );
  const tutarKey = useMemo(() => {
    if (!sheetData) return null;
    return resolveTutarColumn(mesaiTur, sheetData.columns);
  }, [sheetData, mesaiTur]);

  const daireSubeOpts = useMemo(
    () => (sheetData && sheetCols ? collectDaireSubeOptions(sheetData, sheetCols) : null),
    [sheetData, sheetCols]
  );

  const subeSecenekleri = useMemo(() => {
    if (!daireSubeOpts) return [];
    if (!daireFiltre) {
      const all = new Set<string>();
      for (const arr of daireSubeOpts.subelerByDaire.values()) {
        for (const s of arr) all.add(s);
      }
      return [...all].sort((a, b) => a.localeCompare(b, "tr-TR"));
    }
    return daireSubeOpts.subelerByDaire.get(daireFiltre) ?? [];
  }, [daireSubeOpts, daireFiltre]);

  const sheetFilters = useMemo(
    () => ({
      daire: daireFiltre,
      sube: subeFiltre,
      ilce: globalIlce,
    }),
    [daireFiltre, subeFiltre, globalIlce]
  );

  const filtreliAylik = useMemo(
    () => (monthIndex === -1 ? mesai.aylik : mesai.aylik.filter((a) => a.ay === monthIndex)),
    [mesai.aylik, monthIndex]
  );

  const ilceToplamPivot = useMemo(() => {
    const acc = new Map<string, MesaiIlceSatiri & { ayCount: number }>();
    for (const ay of filtreliAylik) {
      for (const s of ay.ilceler) {
        if (globalIlce && s.ilce !== globalIlce) continue;
        if (!acc.has(s.ilce)) {
          acc.set(s.ilce, { ...s, ayCount: 0 });
        } else {
          const e = acc.get(s.ilce)!;
          e.fazlaMesaiSaat += s.fazlaMesaiSaat;
          e.fazlaMesaiTutar += s.fazlaMesaiTutar;
          e.cumartesiGun += s.cumartesiGun;
          e.cumartesiTutar += s.cumartesiTutar;
          e.haftaTatiliGun += s.haftaTatiliGun;
          e.haftaTatiliTutar += s.haftaTatiliTutar;
          e.bayramGun += s.bayramGun;
          e.bayramTutar += s.bayramTutar;
          e.genelToplamTutar += s.genelToplamTutar;
          e.personelSayisi += s.personelSayisi;
        }
        acc.get(s.ilce)!.ayCount += 1;
      }
    }
    return [...acc.values()].sort((a, b) => b.genelToplamTutar - a.genelToplamTutar);
  }, [filtreliAylik, globalIlce]);

  const ilceAggSheet = useMemo(() => {
    if (!sheetData || !sheetCols?.ilce || !tutarKey) return null;
    return aggregateMesaiByIlce(sheetData, { ...sheetCols, tutarKey }, sheetFilters);
  }, [sheetData, sheetCols, tutarKey, sheetFilters]);

  const ayBarData = useMemo(() => {
    if (sheetData && sheetCols?.donem && tutarKey) {
      return aggregateMesaiByAy(
        sheetData,
        { ...sheetCols, tutarKey },
        months,
        sheetFilters,
        monthIndex === -1 ? null : monthIndex
      );
    }
    return mesai.aylik.map((a) => {
      const filtered = globalIlce ? a.ilceler.filter((i) => i.ilce === globalIlce) : a.ilceler;
      return {
        ay: a.ayAd,
        tutar: filtered.reduce((s, i) => s + i.genelToplamTutar, 0),
        personel: filtered.reduce((s, i) => s + i.personelSayisi, 0),
      };
    });
  }, [sheetData, sheetCols, tutarKey, sheetFilters, months, monthIndex, mesai.aylik, globalIlce]);

  const ilceToplam = ilceAggSheet
    ? ilceAggSheet.map((r) => ({
        ilce: r.ilce,
        fazlaMesaiSaat: 0,
        fazlaMesaiTutar: 0,
        cumartesiGun: 0,
        cumartesiTutar: 0,
        haftaTatiliGun: 0,
        haftaTatiliTutar: 0,
        bayramGun: 0,
        bayramTutar: 0,
        genelToplamTutar: r.tutar,
        personelSayisi: r.personel,
      }))
    : ilceToplamPivot;

  const toplamTutar = ilceToplam.reduce((s, r) => s + r.genelToplamTutar, 0);
  const toplamPersonel = ilceAggSheet
    ? ilceAggSheet.reduce((s, r) => s + r.personel, 0)
    : filtreliAylik.reduce((s, a) => s + a.personelSayisi, 0);
  const kisiBasiTutar = toplamPersonel > 0 ? toplamTutar / toplamPersonel : null;

  const turLabel = MESAI_TUR_SEC.find((t) => t.id === mesaiTur)?.label ?? "Genel toplam";

  const selectCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  const btnChip =
    "rounded-lg border px-3 py-1.5 text-xs font-medium transition dark:border-zinc-600";
  const btnChipOn =
    "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600";
  const btnChipOff =
    "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  const ilceButonlari = ilceAggSheet ?? ilceToplamPivot.map((r) => ({
    ilce: r.ilce,
    tutar: r.genelToplamTutar,
    personel: r.personelSayisi,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Ay</strong> ve <strong>yıl</strong> üstteki genel pano filtrelerindedir (
        {monthIndex === -1 ? "Tümü (yıllık)" : months[monthIndex] ?? "—"} · {selectedYear}). Mesai
        Excel verisi{" "}
        <strong>{mesai.dataYear}</strong> yılı içindir
        {selectedYear !== mesai.dataYear && " — seçili yıl mesai özetini göstermez"}.
      </div>

      {sheetData && sheetCols?.daire && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            DATA sayfası filtreleri
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Daire başkanlığı
              <select
                className={selectCls}
                value={daireFiltre}
                onChange={(e) => setDaireFiltre(e.target.value)}
              >
                <option value="">Tümü</option>
                {(daireSubeOpts?.daireler ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Şube
              <select
                className={selectCls}
                value={subeFiltre}
                onChange={(e) => setSubeFiltre(e.target.value)}
              >
                <option value="">Tümü</option>
                {subeSecenekleri.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Mesai türü (tutar sütunu)
            </p>
            <div className="flex flex-wrap gap-2">
              {MESAI_TUR_SEC.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${btnChip} ${mesaiTur === t.id ? btnChipOn : btnChipOff}`}
                  onClick={() => setMesaiTur(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          İlçe (üstteki ilçe ile aynı — tıklayınca üst filtre güncellenir)
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btnChip} ${!globalIlce ? btnChipOn : btnChipOff}`}
            onClick={() => setGlobalIlce("")}
          >
            Tümü
          </button>
          {ilceButonlari.map((r) => (
            <button
              key={r.ilce}
              type="button"
              className={`${btnChip} ${globalIlce === r.ilce ? btnChipOn : btnChipOff}`}
              title={`${nf0.format(r.tutar)} ₺`}
              onClick={() => setGlobalIlce(globalIlce === r.ilce ? "" : r.ilce)}
            >
              {r.ilce}{" "}
              <span className="tabular-nums opacity-90">({nf0.format(r.personel)})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MiniKpi
          label="Toplam mesai tutarı"
          value={`${nf0.format(toplamTutar)} ₺`}
        />
        <MiniKpi
          label="Kayıt / personel (satır)"
          value={nf0.format(toplamPersonel)}
        />
        <MiniKpi
          label="Kişi başı ort. mesai tutarı"
          value={kisiBasiTutar != null ? `${nf2.format(kisiBasiTutar)} ₺` : "—"}
        />
        <MiniKpi
          label="Seçilen mesai türü"
          value={turLabel}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {monthIndex === -1 ? "Aylık mesai tutarı" : `${months[monthIndex]} — mesai tutarı`}
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Tutarlar çubukların üstünde (koyu metin). Ayrıntı için çubuğun üzerine gelin.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={ayBarData} margin={mesaiChartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="ay"
              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={monthIndex === -1 ? -35 : 0}
              textAnchor={monthIndex === -1 ? "end" : "middle"}
              height={monthIndex === -1 ? 52 : 28}
            />
            <YAxis
              tickFormatter={formatYAxisTl}
              tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={yAxisWidth}
            />
            <Tooltip
              formatter={(v: unknown, name) => {
                if (typeof v !== "number") return [String(v), ""];
                const n = String(name ?? "");
                return n === "personel"
                  ? [nf0.format(v), "Kayıt sayısı"]
                  : [`${nf0.format(v)} ₺`, "Tutar"];
              }}
              contentStyle={{
                borderRadius: 8,
                fontSize: 13,
                background: "var(--background)",
                border: "1px solid var(--chart-tooltip-border)",
                color: "var(--foreground)",
              }}
              labelStyle={{
                color: "var(--foreground)",
                fontWeight: 600,
              }}
              itemStyle={{
                color: "var(--foreground)",
              }}
              cursor={{ fill: "rgba(148, 163, 184, 0.14)" }}
            />
            <Bar dataKey="tutar" name="Tutar" fill="#6366f1" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="tutar"
                position="top"
                formatter={(v: unknown) =>
                  typeof v === "number" && v > 0 ? nf0.format(v) : ""
                }
                className="fill-zinc-800 dark:fill-zinc-100"
                style={{ fontSize: 10, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="px-4 pt-4 pb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          İlçe bazlı özet
        </h2>
        <p className="px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
          {ilceAggSheet
            ? `DATA + «${turLabel}» sütunu — detaylı kırılım için pivot tabloya bakın.`
            : "Aylık pivot sayfalarından (Excel)."}
        </p>
        {ilceAggSheet ? (
          <MesaiIlceBasitTable rows={ilceAggSheet} turLabel={turLabel} />
        ) : (
          <MesaiIlceTable rows={ilceToplam} />
        )}
      </div>

      {(mesai.dataSheet?.rows?.length || mesai.dataSheetUrl) && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="px-4 pt-4 pb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            DATA — Personel mesai detayı
          </h2>
          <p className="px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Excel «DATA» sayfasındaki tüm sütunlar. Üstteki daire, şube, ilçe, genel ay ve mesai türü
            bu listeyi süzer; çok satır olduğu için arama ve sayfalama kullanın.
          </p>
          <MesaiDataSheetBlock
            mesai={mesai}
            prefetched={sheetData}
            sheetFilters={sheetFilters}
            monthIndex={monthIndex}
            mesaiTur={mesaiTur}
          />
        </div>
      )}

      {mesai.top10Sube.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="px-4 pt-4 pb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            En Yüksek Mesai Yapan 10 Şube
          </h2>
          <MesaiTop10Sube rows={mesai.top10Sube} />
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Dosya: {mesai.sourceFile} · Yıl: {mesai.dataYear}
      </p>
    </div>
  );
}

function MesaiIlceBasitTable({
  rows,
  turLabel,
}: {
  rows: { ilce: string; tutar: number; personel: number }[];
  turLabel: string;
}) {
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">İlçe</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
              Kayıt
            </th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
              {turLabel} (₺)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-500">
                Veri yok.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.ilce}
                className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800/80 dark:hover:bg-zinc-900/50"
              >
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.ilce}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                  {nf0.format(r.personel)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {nf0.format(r.tutar)} ₺
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-100 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">TOPLAM</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf0.format(rows.reduce((s, r) => s + r.personel, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf0.format(rows.reduce((s, r) => s + r.tutar, 0))} ₺
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MesaiDataSheetBlock({
  mesai,
  prefetched,
  sheetFilters,
  monthIndex,
  mesaiTur,
}: {
  mesai: NonNullable<DashboardPayload["mesai"]>;
  /** Mesai sekmesi zaten DATA yüklediyse tekrar istek atma */
  prefetched?: MesaiDataSheet | null;
  /** Üstteki DATA filtreleri — personel tablosuna uygulanır */
  sheetFilters: MesaiSheetFilters;
  monthIndex: number;
  mesaiTur: MesaiTurFiltre;
}) {
  const hasInline = mesai.dataSheet && mesai.dataSheet.rows.length > 0;
  const url = mesai.dataSheetUrl;
  const [fetched, setFetched] = useState<MesaiDataSheet | null>(
    () => prefetched?.rows?.length ? prefetched : null
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (prefetched?.rows?.length) {
      setFetched(prefetched);
      return;
    }
  }, [prefetched]);

  useEffect(() => {
    if (hasInline || prefetched?.rows?.length || !url) return;
    let cancel = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MesaiDataSheet>;
      })
      .then((j) => {
        if (!cancel && j?.columns && Array.isArray(j.rows)) setFetched(j);
      })
      .catch((e: Error) => {
        if (!cancel) setLoadErr(e.message);
      });
    return () => {
      cancel = true;
    };
  }, [hasInline, url, prefetched]);

  const data = hasInline
    ? mesai.dataSheet!
    : prefetched?.rows?.length
      ? prefetched
      : fetched;

  const filteredRows = useMemo(() => {
    if (!data) return [];
    return filterMesaiDataSheetRows(data, sheetFilters, monthIndex, mesaiTur);
  }, [data, sheetFilters, monthIndex, mesaiTur]);

  const tableData = useMemo((): MesaiDataSheet | null => {
    if (!data) return null;
    return { ...data, rows: filteredRows };
  }, [data, filteredRows]);

  if (!data || !tableData) {
    return (
      <div className="px-4 pb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {loadErr ? (
          <>Tablo yüklenemedi ({loadErr}). </>
        ) : (
          <>DATA tablosu yükleniyor… </>
        )}
        {mesai.dataSheetStats != null && (
          <span className="text-zinc-500">
            Beklenen: {mesai.dataSheetStats.rowCount.toLocaleString("tr-TR")} satır,{" "}
            {mesai.dataSheetStats.columnCount} sütun.
          </span>
        )}
      </div>
    );
  }

  const totalInFile = data.rows.length;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-4 text-xs text-zinc-600 dark:text-zinc-400">
        Üst filtreler sonrası{" "}
        <strong className="tabular-nums text-zinc-800 dark:text-zinc-200">
          {filteredRows.length.toLocaleString("tr-TR")}
        </strong>{" "}
        / {totalInFile.toLocaleString("tr-TR")} satır
        {monthIndex >= 0 && monthIndex <= 11 && (
          <span className="text-zinc-500"> · Maaş dönemi ayı üstteki ay ile eşleşen kayıtlar</span>
        )}
      </p>
      <MesaiDataSheetTable data={tableData} />
    </div>
  );
}

function MesaiDataSheetTable({ data }: { data: MesaiDataSheet }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatCell = (v: string | number | null) => {
    if (v == null || v === "") return "—";
    if (typeof v === "number") {
      return Number.isInteger(v) ? nf0.format(v) : nf2.format(v);
    }
    return String(v);
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    if (!t) return data.rows;
    return data.rows.filter((row) =>
      data.columns.some((col) => {
        const v = row[col];
        if (v == null) return false;
        return String(v).toLocaleLowerCase("tr-TR").includes(t);
      })
    );
  }, [data.columns, data.rows, q]);

  useEffect(() => {
    setPage(0);
  }, [q, data.rows.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  const inputCls =
    "w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Satırlarda ara
          <input
            type="search"
            className={inputCls}
            placeholder="İlçe, şube, ad, TC…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {filtered.length.toLocaleString("tr-TR")} / {data.rows.length.toLocaleString("tr-TR")}{" "}
          satır
        </p>
      </div>

      <div className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              {data.columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-2 py-2 font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr
                key={`${currentPage}-${ri}`}
                className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50"
              >
                {data.columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-[14rem] truncate whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-800 dark:text-zinc-200"
                    title={formatCell(row[col])}
                  >
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>
          Sayfa {currentPage + 1} / {totalPages} · Sayfa başına {pageSize}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            disabled={currentPage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Önceki
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}

function MesaiIlceTable({ rows }: { rows: (MesaiIlceSatiri & { ayCount?: number })[] }) {
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">İlçe</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Personel Sayısı</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Fazla Mesai (Saat)</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Cumartesi (Gün)</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Hafta Tatili (Gün)</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Bayram (Gün)</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Genel Toplam (₺)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Veri yok.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.ilce} className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800/80 dark:hover:bg-zinc-900/50">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.ilce}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf0.format(r.personelSayisi)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf1.format(r.fazlaMesaiSaat)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf1.format(r.cumartesiGun)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf1.format(r.haftaTatiliGun)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf1.format(r.bayramGun)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{nf0.format(r.genelToplamTutar)} ₺</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-100 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">TOPLAM</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf0.format(rows.reduce((s, r) => s + r.personelSayisi, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf1.format(rows.reduce((s, r) => s + r.fazlaMesaiSaat, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf1.format(rows.reduce((s, r) => s + r.cumartesiGun, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf1.format(rows.reduce((s, r) => s + r.haftaTatiliGun, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                {nf1.format(rows.reduce((s, r) => s + r.bayramGun, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {nf0.format(rows.reduce((s, r) => s + r.genelToplamTutar, 0))} ₺
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MesaiTop10Sube({ rows }: { rows: MesaiSubeSatiri[] }) {
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <th className="px-3 py-2 text-center font-semibold text-zinc-700 dark:text-zinc-300">#</th>
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Şube</th>
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">İlçe</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Kişi-Ay</th>
            <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Toplam Mesai (₺)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.sube}
              className={`border-b border-zinc-100 dark:border-zinc-800/80 ${
                i === 0 ? "bg-indigo-50/60 dark:bg-indigo-950/30" : "hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
              }`}
            >
              <td className="px-3 py-2 text-center tabular-nums font-bold text-zinc-500 dark:text-zinc-400">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.sube}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.ilce}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{nf0.format(r.personelSayisi)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{nf0.format(r.tutar)} ₺</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  hint,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueCompact?: boolean;
  /** Üzerine gelince kırılım (ör. gider kalemleri) */
  hint?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
      title={hint}
    >
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
