export type MonthlyCell = {
  okuma: number | null;
  fatura: number | null;
  m3: number | null;
  tahakkuk: number | null;
};

/** Veri.xlsx → KAYNAK-TERFİ-DEPO sayfasından (ilçe+mahalle eşleşmesi) */
export type KaynakDepoOzeti = {
  depo: string;
  kaynak: string;
  terfi: string;
};

export type DashboardRecord = {
  defterNo: number;
  mahalle: string;
  ilce: string;
  abone: number;
  nufus: number | null;
  /** Depo / kaynak / terfi adları (çoklu ise "; " ile ayrılmış) */
  kaynakDepo?: KaynakDepoOzeti | null;
  monthly: MonthlyCell[];
};

export type DashboardPayload = {
  generatedAt: string;
  /** Örn. "Nufus.xlsx (Sheet1)" */
  nufusKaynak?: string;
  months: string[];
  ilceler: string[];
  mahalleler: Record<string, string[]>;
  records: DashboardRecord[];
};

export type MonthlyTotals = {
  okuma: number;
  fatura: number;
  m3: number;
  tahakkuk: number;
};

export type AggregatedStats = {
  totalAbone: number;
  totalNufus: number;
  hasNufusData: boolean;
  monthly: MonthlyTotals[];
  totalM3: number;
  totalTahakkuk: number;
  /** Abone / nüfus × 100 (abonenin nüfusa oranı) */
  aboneNufusYuzde: number | null;
  m3PerAbone: number | null;
  birimFiyat: number | null;
};

function addCell(acc: MonthlyTotals, cell: MonthlyCell) {
  if (cell.okuma != null) acc.okuma += cell.okuma;
  if (cell.fatura != null) acc.fatura += cell.fatura;
  if (cell.m3 != null) acc.m3 += cell.m3;
  if (cell.tahakkuk != null) acc.tahakkuk += cell.tahakkuk;
}

export function filterRecords(
  records: DashboardRecord[],
  ilce: string | null,
  mahalle: string | null
): DashboardRecord[] {
  return records.filter((r) => {
    if (ilce && r.ilce !== ilce) return false;
    if (mahalle && r.mahalle !== mahalle) return false;
    return true;
  });
}

export function aggregate(filtered: DashboardRecord[]): AggregatedStats {
  const nufusByMahalle = new Map<string, number>();
  let totalAbone = 0;
  const monthly: MonthlyTotals[] = Array.from({ length: 12 }, () => ({
    okuma: 0,
    fatura: 0,
    m3: 0,
    tahakkuk: 0,
  }));

  for (const r of filtered) {
    totalAbone += r.abone;
    const mk = `${r.ilce}\u0000${r.mahalle}`;
    if (r.nufus != null && !nufusByMahalle.has(mk)) {
      nufusByMahalle.set(mk, r.nufus);
    }
    r.monthly.forEach((cell, i) => addCell(monthly[i], cell));
  }

  let totalNufus = 0;
  for (const v of nufusByMahalle.values()) totalNufus += v;
  const hasNufusData = nufusByMahalle.size > 0;

  const totalM3 = monthly.reduce((s, m) => s + m.m3, 0);
  const totalTahakkuk = monthly.reduce((s, m) => s + m.tahakkuk, 0);

  return {
    totalAbone,
    totalNufus,
    hasNufusData,
    monthly,
    totalM3,
    totalTahakkuk,
    aboneNufusYuzde:
      totalNufus > 0 ? (totalAbone / totalNufus) * 100 : null,
    m3PerAbone: totalAbone > 0 ? totalM3 / totalAbone : null,
    birimFiyat: totalM3 > 0 ? totalTahakkuk / totalM3 : null,
  };
}

function splitOzetiParts(s: string, into: Set<string>) {
  if (!s?.trim()) return;
  for (const part of s.split(";")) {
    const t = part.trim();
    if (t) into.add(t);
  }
}

/** Seçili defterlerde geçen benzersiz depo, kaynak ve terfi isimleri */
export function collectKaynakDepoSummary(
  records: DashboardRecord[]
): KaynakDepoOzeti | null {
  const dep = new Set<string>();
  const kay = new Set<string>();
  const ter = new Set<string>();
  for (const r of records) {
    if (!r.kaynakDepo) continue;
    splitOzetiParts(r.kaynakDepo.depo, dep);
    splitOzetiParts(r.kaynakDepo.kaynak, kay);
    splitOzetiParts(r.kaynakDepo.terfi, ter);
  }
  if (dep.size === 0 && kay.size === 0 && ter.size === 0) return null;
  const sortTr = (a: string, b: string) => a.localeCompare(b, "tr-TR");
  return {
    depo: [...dep].sort(sortTr).join("; "),
    kaynak: [...kay].sort(sortTr).join("; "),
    terfi: [...ter].sort(sortTr).join("; "),
  };
}

export function statsForMonth(
  agg: AggregatedStats,
  monthIndex: number
): Pick<
  AggregatedStats,
  "totalAbone" | "totalNufus" | "hasNufusData" | "aboneNufusYuzde"
> & {
  totalM3: number;
  totalTahakkuk: number;
  m3PerAbone: number | null;
  birimFiyat: number | null;
} {
  const m = agg.monthly[monthIndex] ?? {
    okuma: 0,
    fatura: 0,
    m3: 0,
    tahakkuk: 0,
  };
  const totalM3 = m.m3;
  const totalTahakkuk = m.tahakkuk;
  return {
    totalAbone: agg.totalAbone,
    totalNufus: agg.totalNufus,
    hasNufusData: agg.hasNufusData,
    aboneNufusYuzde: agg.aboneNufusYuzde,
    totalM3,
    totalTahakkuk,
    m3PerAbone: agg.totalAbone > 0 ? totalM3 / agg.totalAbone : null,
    birimFiyat: totalM3 > 0 ? totalTahakkuk / totalM3 : null,
  };
}

/** Tüm defterler üzerinden ilçe bazlı özet (filtre dışı, karşılaştırma için) */
export type IlcePerformansMod =
  | { tur: "yillik" }
  | { tur: "aylik"; ayIndeks: number };

export type IlcePerformansSatiri = {
  ilce: string;
  toplamAbone: number;
  toplamOkuma: number;
  toplamM3: number;
  /** Dönem toplam M³ / toplam okunabilir abone */
  ortalamaM3PerAbone: number;
  /** Σ okuma / Σ abone (sayaç okuma / okunabilir abone) */
  okumaBolumAbone: number;
  /** (Σ abone − Σ okuma) / Σ abone × 100; okuma > abone ise negatif olabilir */
  okunamayanYuzde: number;
  /** Okuma/abone oranına göre azalan sıra; 1 = en yüksek oran */
  basariSirasi: number;
};

export function computeIlcePerformans(
  records: DashboardRecord[],
  mod: IlcePerformansMod
): IlcePerformansSatiri[] {
  const acc = new Map<
    string,
    { abone: number; okuma: number; m3: number }
  >();

  for (const r of records) {
    const ilce = r.ilce?.trim();
    if (!ilce) continue;
    if (!acc.has(ilce)) {
      acc.set(ilce, { abone: 0, okuma: 0, m3: 0 });
    }
    const b = acc.get(ilce)!;
    b.abone += r.abone;

    if (mod.tur === "yillik") {
      for (let i = 0; i < 12; i++) {
        const c = r.monthly[i];
        if (c?.okuma != null) b.okuma += c.okuma;
        if (c?.m3 != null) b.m3 += c.m3;
      }
    } else {
      const c = r.monthly[mod.ayIndeks];
      if (c?.okuma != null) b.okuma += c.okuma;
      if (c?.m3 != null) b.m3 += c.m3;
    }
  }

  const satirlar: IlcePerformansSatiri[] = [];
  for (const [ilce, v] of acc) {
    if (v.abone <= 0) continue;
    const ortalamaM3PerAbone = v.m3 / v.abone;
    const okumaBolumAbone = v.okuma / v.abone;
    const okunamayanYuzde = ((v.abone - v.okuma) / v.abone) * 100;
    satirlar.push({
      ilce,
      toplamAbone: v.abone,
      toplamOkuma: v.okuma,
      toplamM3: v.m3,
      ortalamaM3PerAbone,
      okumaBolumAbone,
      okunamayanYuzde,
      basariSirasi: 0,
    });
  }

  satirlar.sort((a, b) => b.okumaBolumAbone - a.okumaBolumAbone);
  return satirlar.map((row, i) => ({
    ...row,
    basariSirasi: i + 1,
  }));
}
