export type MonthlyCell = {
  okuma: number | null;
  fatura: number | null;
  m3: number | null;
  tahakkuk: number | null;
};

export type DashboardRecord = {
  defterNo: number;
  mahalle: string;
  ilce: string;
  abone: number;
  nufus: number | null;
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
