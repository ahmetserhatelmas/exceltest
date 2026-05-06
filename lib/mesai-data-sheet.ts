import type { MesaiDataSheet } from "@/lib/dashboard";

export type MesaiTurFiltre =
  | "genel"
  | "fazla"
  | "cumartesi"
  | "haftatatil"
  | "bayram";

const MONTH_KEYS = [
  "OCAK",
  "ŞUBAT",
  "MART",
  "NİSAN",
  "MAYIS",
  "HAZİRAN",
  "TEMMUZ",
  "AĞUSTOS",
  "EYLÜL",
  "EKİM",
  "KASIM",
  "ARALIK",
] as const;

function normCol(s: string) {
  return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

function cellNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const t = v.trim().replace(/\u00a0/g, "").replace(/\s/g, "");
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** MAAŞ DÖNEM metninden ay indeksi (0–11) */
export function maasDonemAyIndeks(cell: unknown): number | null {
  const t = String(cell ?? "").toLocaleUpperCase("tr-TR");
  for (let i = 0; i < MONTH_KEYS.length; i++) {
    if (t.includes(MONTH_KEYS[i])) return i;
  }
  return null;
}

export type MesaiSheetCols = {
  donem: string | null;
  daire: string | null;
  sube: string | null;
  ilce: string | null;
  tutarKey: string | null;
};

export function resolveMesaiSheetColumns(columns: string[]): MesaiSheetCols {
  const by = (sub: string) =>
    columns.find((c) => normCol(c).includes(normCol(sub))) ?? null;
  return {
    donem: by("MAAŞ DÖNEM") ?? columns[0] ?? null,
    daire: by("DAİ.BŞK") ?? by("DAİRE") ?? null,
    sube: by("OLDUĞU ŞUBE") ?? by("BAĞLI OLDUĞU ŞUBE") ?? null,
    ilce: by("İLÇE"),
    tutarKey: null,
  };
}

export function resolveTutarColumn(
  tur: MesaiTurFiltre,
  columns: string[]
): string | null {
  const n = (c: string) => normCol(c);
  switch (tur) {
    case "genel":
      return (
        columns.find((c) => n(c).includes("GENEL TOPLAM MESA") && n(c).includes("TUTAR")) ??
        columns.find((c) => n(c).includes("GENEL TOPLAM") && n(c).includes("TUTAR")) ??
        null
      );
    case "fazla":
      return (
        columns.find(
          (c) =>
            n(c).includes("FAZLA") &&
            n(c).includes("TUTAR") &&
            !n(c).includes("TOPLAM FAZLA")
        ) ?? null
      );
    case "cumartesi":
      return columns.find((c) => n(c).includes("CUMARTESI") && n(c).includes("TUTAR")) ?? null;
    case "haftatatil":
      return columns.find((c) => n(c).includes("HAFTATATIL") && n(c).includes("TUTAR")) ?? null;
    case "bayram":
      return (
        columns.find((c) => n(c).includes("BAYRAM") && n(c).includes("TUTAR")) ?? null
      );
    default:
      return null;
  }
}

export function uniqueSortedStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "tr-TR")
  );
}

export type MesaiSheetFilters = {
  daire: string;
  sube: string;
  /** Üst pano ilçesi — boşsa tümü */
  ilce: string;
};

/** Filtrelenmiş satırlardan ilçe → tutar + personel (satır sayısı) */
export function aggregateMesaiByIlce(
  sheet: MesaiDataSheet,
  cols: MesaiSheetCols & { tutarKey: string },
  filters: MesaiSheetFilters
): { ilce: string; tutar: number; personel: number }[] {
  const ilceKey = cols.ilce;
  if (!ilceKey || !cols.tutarKey) return [];
  const map = new Map<string, { tutar: number; personel: number }>();
  for (const row of sheet.rows) {
    const d = cols.daire ? String(row[cols.daire] ?? "").trim() : "";
    const s = cols.sube ? String(row[cols.sube] ?? "").trim() : "";
    const il = String(row[ilceKey] ?? "").trim().toLocaleUpperCase("tr-TR");
    if (!il) continue;
    if (filters.daire && d !== filters.daire) continue;
    if (filters.sube && s !== filters.sube) continue;
    if (filters.ilce && il !== filters.ilce.toLocaleUpperCase("tr-TR")) continue;
    const t = cellNum(row[cols.tutarKey]);
    if (!map.has(il)) map.set(il, { tutar: 0, personel: 0 });
    const e = map.get(il)!;
    e.tutar += t;
    e.personel += 1;
  }
  return [...map.entries()]
    .map(([ilce, v]) => ({ ilce, ...v }))
    .sort((a, b) => b.tutar - a.tutar);
}

/** Ay başına (ay adı + tutar + personel) — DATA satırlarından */
export function aggregateMesaiByAy(
  sheet: MesaiDataSheet,
  cols: MesaiSheetCols & { tutarKey: string },
  monthLabels: string[],
  filters: MesaiSheetFilters,
  /** Üst aydan: yalnızca bu ay (null = 12 ay) */
  onlyAyIndex: number | null = null
): { ay: string; tutar: number; personel: number }[] {
  const donemKey = cols.donem;
  const ilceKey = cols.ilce;
  if (!donemKey || !cols.tutarKey) {
    return monthLabels.map((ay) => ({ ay, tutar: 0, personel: 0 }));
  }
  const byAy = new Map<number, { tutar: number; personel: number }>();
  for (let i = 0; i < 12; i++) byAy.set(i, { tutar: 0, personel: 0 });

  for (const row of sheet.rows) {
    const d = cols.daire ? String(row[cols.daire] ?? "").trim() : "";
    const s = cols.sube ? String(row[cols.sube] ?? "").trim() : "";
    const il = ilceKey
      ? String(row[ilceKey] ?? "").trim().toLocaleUpperCase("tr-TR")
      : "";
    if (filters.daire && d !== filters.daire) continue;
    if (filters.sube && s !== filters.sube) continue;
    if (filters.ilce && il !== filters.ilce.toLocaleUpperCase("tr-TR")) continue;
    const ai = maasDonemAyIndeks(row[donemKey]);
    if (ai == null || ai < 0 || ai > 11) continue;
    if (onlyAyIndex != null && ai !== onlyAyIndex) continue;
    const t = cellNum(row[cols.tutarKey]);
    const e = byAy.get(ai)!;
    e.tutar += t;
    e.personel += 1;
  }

  const out = monthLabels.map((ay, i) => {
    const v = byAy.get(i)!;
    return { ay, tutar: v.tutar, personel: v.personel };
  });
  if (onlyAyIndex != null && onlyAyIndex >= 0 && onlyAyIndex < 12) {
    return [out[onlyAyIndex]!];
  }
  return out;
}

export function collectDaireSubeOptions(
  sheet: MesaiDataSheet,
  cols: MesaiSheetCols
): { daireler: string[]; subelerByDaire: Map<string, string[]> } {
  const daireSet = new Set<string>();
  const subeAll = new Set<string>();
  const byD = new Map<string, Set<string>>();

  for (const row of sheet.rows) {
    const d = cols.daire ? String(row[cols.daire] ?? "").trim() : "";
    const s = cols.sube ? String(row[cols.sube] ?? "").trim() : "";
    if (d) daireSet.add(d);
    if (s) subeAll.add(s);
    if (d && s) {
      if (!byD.has(d)) byD.set(d, new Set());
      byD.get(d)!.add(s);
    }
  }

  const subelerByDaire = new Map<string, string[]>();
  for (const [d, set] of byD) {
    subelerByDaire.set(d, uniqueSortedStrings(set));
  }
  return {
    daireler: uniqueSortedStrings(daireSet),
    subelerByDaire,
  };
}
