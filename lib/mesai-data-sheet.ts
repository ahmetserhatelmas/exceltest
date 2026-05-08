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

/** Türkçe İ/I ve benzeri farkları kaldırır (sütun adı eşlemesi için) */
function foldTrAscii(s: string): string {
  return normCol(s)
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

/**
 * Excel İLÇE hücresini Veri.xlsx ilçe listesiyle eşler (MERKEZ / MERKEZ İLÇESİ vb.).
 */
export function normalizeIlceAgainstAllowlist(
  raw: string,
  allowedUpper: Set<string>
): string | null {
  const t = raw.trim();
  if (!t) return null;
  let u = t.toLocaleUpperCase("tr-TR");
  if (allowedUpper.has(u)) return u;
  const stripped = u
    .replace(/\s+İLÇESİ\s*$/iu, "")
    .replace(/\s+İLÇE\s*$/iu, "")
    .trim()
    .toLocaleUpperCase("tr-TR");
  if (stripped && allowedUpper.has(stripped)) return stripped;
  return null;
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
  const f = (c: string) => foldTrAscii(c);
  switch (tur) {
    case "genel":
      return (
        columns.find((c) => n(c).includes("GENEL TOPLAM MESA") && n(c).includes("TUTAR")) ??
        columns.find((c) => n(c).includes("GENEL TOPLAM") && n(c).includes("TUTAR")) ??
        columns.find((c) => f(c).includes("GENEL TOPLAM") && f(c).includes("MESA") && f(c).includes("TUTAR")) ??
        null
      );
    case "fazla":
      return (
        columns.find(
          (c) =>
            n(c).includes("FAZLA") &&
            n(c).includes("TUTAR") &&
            !n(c).includes("TOPLAM FAZLA")
        ) ??
        columns.find(
          (c) =>
            f(c).includes("FAZLA") &&
            f(c).includes("TUTAR") &&
            !f(c).includes("TOPLAM FAZLA")
        ) ??
        null
      );
    case "cumartesi":
      return (
        columns.find((c) => n(c).includes("CUMARTESI") && n(c).includes("TUTAR")) ??
        columns.find((c) => f(c).includes("CUMARTES") && f(c).includes("TUTAR")) ??
        null
      );
    case "haftatatil":
      return (
        columns.find((c) => n(c).includes("HAFTATATIL") && n(c).includes("TUTAR")) ??
        columns.find((c) => f(c).includes("HAFTATATIL") && f(c).includes("TUTAR")) ??
        columns.find(
          (c) => f(c).includes("HAFTA") && f(c).includes("TATIL") && f(c).includes("TUTAR")
        ) ??
        null
      );
    case "bayram":
      return (
        columns.find((c) => n(c).includes("BAYRAM") && n(c).includes("TUTAR")) ??
        columns.find((c) => f(c).includes("BAYRAM") && f(c).includes("TUTAR")) ??
        null
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

/**
 * Üstteki daire / şube / ilçe / ay / mesai türü ile DATA personel satırlarını süz.
 * `monthIndex === -1` → aya göre süzme yok. `mesaiTur !== genel` → seçilen tutar sütunu > 0.
 */
export function filterMesaiDataSheetRows(
  sheet: MesaiDataSheet,
  filters: MesaiSheetFilters,
  monthIndex: number,
  mesaiTur: MesaiTurFiltre,
  /** Veri.xlsx ilçe listesi — Excel’de yanlış «ilçe» (ör. Hukuk müş.) satırlarını ele */
  allowedIlceUpper?: Set<string> | null
): Record<string, string | number | null>[] {
  const cols = resolveMesaiSheetColumns(sheet.columns);
  const tutarKey = resolveTutarColumn(mesaiTur, sheet.columns);
  const wantPositiveTutar = mesaiTur !== "genel" && tutarKey != null;

  return sheet.rows.filter((row) => {
    if (cols.ilce) {
      const raw = String(row[cols.ilce] ?? "");
      let canon: string;
      if (allowedIlceUpper && allowedIlceUpper.size > 0) {
        const n = normalizeIlceAgainstAllowlist(raw, allowedIlceUpper);
        if (n == null) return false;
        canon = n;
      } else {
        canon = raw.trim().toLocaleUpperCase("tr-TR");
        if (!canon) return false;
      }
      if (filters.ilce && canon !== filters.ilce.trim().toLocaleUpperCase("tr-TR")) {
        return false;
      }
    }
    if (cols.daire && filters.daire) {
      const d = String(row[cols.daire] ?? "").trim();
      if (d !== filters.daire) return false;
    }
    if (cols.sube && filters.sube) {
      const s = String(row[cols.sube] ?? "").trim();
      if (s !== filters.sube) return false;
    }
    if (cols.donem && monthIndex >= 0 && monthIndex <= 11) {
      const ai = maasDonemAyIndeks(row[cols.donem]);
      if (ai !== monthIndex) return false;
    }
    if (wantPositiveTutar && tutarKey) {
      if (cellNum(row[tutarKey]) <= 0) return false;
    }
    return true;
  });
}

/** Filtrelenmiş satırlardan ilçe → tutar + personel (satır sayısı) */
export function aggregateMesaiByIlce(
  sheet: MesaiDataSheet,
  cols: MesaiSheetCols & { tutarKey: string },
  filters: MesaiSheetFilters,
  allowedIlceUpper?: Set<string> | null,
  /** Üst şerit ayı — personel detayı ile aynı (maaş dönemi) */
  monthIndex: number = -1,
  mesaiTur: MesaiTurFiltre = "genel"
): { ilce: string; tutar: number; personel: number }[] {
  const ilceKey = cols.ilce;
  const donemKey = cols.donem;
  if (!ilceKey || !cols.tutarKey) return [];
  const wantPositiveTutar = mesaiTur !== "genel";
  const map = new Map<string, { tutar: number; personel: number }>();
  for (const row of sheet.rows) {
    const d = cols.daire ? String(row[cols.daire] ?? "").trim() : "";
    const s = cols.sube ? String(row[cols.sube] ?? "").trim() : "";
    let ilCanon: string;
    const rawIl = String(row[ilceKey] ?? "");
    if (allowedIlceUpper && allowedIlceUpper.size > 0) {
      const n = normalizeIlceAgainstAllowlist(rawIl, allowedIlceUpper);
      if (n == null) continue;
      ilCanon = n;
    } else {
      ilCanon = rawIl.trim().toLocaleUpperCase("tr-TR");
      if (!ilCanon) continue;
    }
    if (filters.daire && d !== filters.daire) continue;
    if (filters.sube && s !== filters.sube) continue;
    if (filters.ilce && ilCanon !== filters.ilce.trim().toLocaleUpperCase("tr-TR")) continue;
    if (donemKey && monthIndex >= 0 && monthIndex <= 11) {
      const ai = maasDonemAyIndeks(row[donemKey]);
      if (ai !== monthIndex) continue;
    }
    const t = cellNum(row[cols.tutarKey]);
    if (wantPositiveTutar && t <= 0) continue;
    if (!map.has(ilCanon)) map.set(ilCanon, { tutar: 0, personel: 0 });
    const e = map.get(ilCanon)!;
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
  onlyAyIndex: number | null = null,
  allowedIlceUpper?: Set<string> | null,
  mesaiTur: MesaiTurFiltre = "genel"
): { ay: string; tutar: number; personel: number }[] {
  const donemKey = cols.donem;
  const ilceKey = cols.ilce;
  if (!donemKey || !cols.tutarKey) {
    return monthLabels.map((ay) => ({ ay, tutar: 0, personel: 0 }));
  }
  const wantPositiveTutar = mesaiTur !== "genel";
  const byAy = new Map<number, { tutar: number; personel: number }>();
  for (let i = 0; i < 12; i++) byAy.set(i, { tutar: 0, personel: 0 });

  for (const row of sheet.rows) {
    const d = cols.daire ? String(row[cols.daire] ?? "").trim() : "";
    const s = cols.sube ? String(row[cols.sube] ?? "").trim() : "";
    let ilCanon = "";
    if (ilceKey) {
      const rawIl = String(row[ilceKey] ?? "");
      if (allowedIlceUpper && allowedIlceUpper.size > 0) {
        const n = normalizeIlceAgainstAllowlist(rawIl, allowedIlceUpper);
        if (n == null) continue;
        ilCanon = n;
      } else {
        ilCanon = rawIl.trim().toLocaleUpperCase("tr-TR");
        if (!ilCanon) continue;
      }
    }
    if (filters.daire && d !== filters.daire) continue;
    if (filters.sube && s !== filters.sube) continue;
    if (filters.ilce && ilCanon !== filters.ilce.trim().toLocaleUpperCase("tr-TR")) continue;
    const ai = maasDonemAyIndeks(row[donemKey]);
    if (ai == null || ai < 0 || ai > 11) continue;
    if (onlyAyIndex != null && ai !== onlyAyIndex) continue;
    const t = cellNum(row[cols.tutarKey]);
    if (wantPositiveTutar && t <= 0) continue;
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
