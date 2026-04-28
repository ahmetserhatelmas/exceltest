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

export type HatYilDilimi = {
  isletme: number;
  yatirim: number;
};

export type HatUzunlukHucre = {
  mevcut: number | null;
  /** Tüm yılların işletme toplamı (Excel satırından) */
  isletme: number;
  /** Tüm yılların yatırım toplamı (Excel satırından) */
  yatirim: number;
  /** Excel kümülatif toplam sütunu (m) */
  toplam: number | null;
  /** Yıla göre eklenen hat (m) — JSON anahtarları string olabilir */
  byYear?: Record<string, HatYilDilimi>;
};

export type ElektrikAylikHucre = {
  kwh: number;
  tahakkuk: number;
};

export type ElektrikDetaySatiri = {
  key: "yagmur" | "kanalizasyon" | "icme";
  label: string;
  totalKwh: number;
  totalTahakkuk: number;
  count: number;
  byIlce?: Record<string, { kwh: number; tahakkuk: number; count: number }>;
  aylikToplam?: ElektrikAylikHucre[] | null;
  byIlceAylik?: Record<
    string,
    { count: number; aylik: ElektrikAylikHucre[] }
  > | null;
  /** mahalleKey(ilce, mahalle) → Excel satır birleşimi (3 elektrik sayfası) */
  byKonumAylik?: Record<
    string,
    { ilce: string; mahalle: string; count: number; aylik: ElektrikAylikHucre[] }
  > | null;
};

export type DashboardRecord = {
  defterNo: number;
  mahalle: string;
  ilce: string;
  muhtar?: string;
  telefon?: string;
  abone: number;
  nufus: number | null;
  /** Depo / kaynak / terfi adları (çoklu ise "; " ile ayrılmış) */
  kaynakDepo?: KaynakDepoOzeti | null;
  monthly: MonthlyCell[];
};

/** Defter satırı için seçilen dönemdeki toplam tahakkuk (TL) */
export function recordTahakkukDönem(
  r: DashboardRecord,
  tur: "yillik" | "aylik",
  ayIndeks: number
): number {
  if (tur === "yillik") {
    return r.monthly.reduce((s, c) => s + (c.tahakkuk ?? 0), 0);
  }
  return r.monthly[ayIndeks]?.tahakkuk ?? 0;
}

export type DashboardPayload = {
  generatedAt: string;
  /** Excel verisinin ait olduğu yıl (ör. 2025) */
  dataYear?: number;
  sourceFile?: string;
  /** Örn. "Nufus.xlsx (Sheet1)" */
  nufusKaynak?: string;
  /** Nufus.xlsx tüm satırları toplamı (eşleşmeden bağımsız) */
  nufusToplam?: number;
  /** Nufus.xlsx ilçe bazlı nüfus toplamları (Veri.xlsx ilçe adı → nüfus) */
  nufusIlceToplam?: Record<string, number>;
  months: string[];
  ilceler: string[];
  mahalleler: Record<string, string[]>;
  records: DashboardRecord[];
  /** Yakıt icmali (Taşıt + Demirbaş); ayrı Excel dosyasından veya gömülü sayfadan */
  yakit?: {
    sourceFile: string;
    sheet: string;
    yakitYear: number;
    toplamTasitTahakkuku: number;
    toplamDemirbasTahakkuku: number;
    toplamYakitTahakkuku: number;
    byIlce: Record<
      string,
      {
        tasitTahakkuku: number;
        demirbasTahakkuku: number;
        toplamYakitTahakkuku: number;
      }
    >;
  };
  elektrik?: {
    toplamElektrikTuketimiKwh: number;
    toplamElektrikTahakkuku: number;
    toplamSuTahakkuku: number;
    /** Su tahakkuku − toplam gider (gider = elektrik + yakıt; yakıt yoksa yalnız elektrik) */
    netGelir: number;
    detay: ElektrikDetaySatiri[];
    ilceDetay?: Array<{
      ilce: string;
      toplamKwh: number;
      toplamTahakkuk: number;
      yagmurKwh: number;
      yagmurTahakkuk: number;
      kanalizasyonKwh: number;
      kanalizasyonTahakkuk: number;
      icmeKwh: number;
      icmeTahakkuk: number;
    }>;
  };
  /** Excel hat uzunluğu sayfaları (ilçe bazlı metre) */
  hatUzunluklari?: {
    sheets: {
      icmeSuyu: string;
      kanalizasyon: string;
      yagmurSuyu: string;
    };
    /** Hat sayfalarında geçen yıl başlıkları (sıralı) */
    yillar?: number[];
    /** "< 2013" gibi ilk sütun başlığının sayısal yılı (genelde 2013); mevcut hat stoku */
    mevcutKovasiYili?: number | null;
    ilceler: Array<{
      ilce: string;
      icmeSuyu: HatUzunlukHucre | null;
      kanalizasyon: HatUzunlukHucre | null;
      yagmurSuyu: HatUzunlukHucre | null;
    }>;
    ozet: {
      icmeSuyuMetre: number;
      kanalizasyonMetre: number;
      yagmurSuyuMetre: number;
      kanalizasyonIsletmeYuzde: number | null;
      kanalizasyonYatirimYuzde: number | null;
    };
  };
  /** Excel «Kanalizasyon Hattı VAR-YOK» (plan nüfus + VAR/YOK) */
  kanalHatVarYok?: {
    sheetLabel: string;
    satirlar: KanalHatVarYokSatiri[];
  };
};

export type KanalHatVarYokDurum = "var" | "yok" | "kismi" | "diger";

export type KanalHatVarYokSatiri = {
  ilce: string;
  mahalle: string;
  konumKey: string;
  nufus: number;
  abone: number | null;
  durum: KanalHatVarYokDurum;
};

export type KanalHatVarYokOzet = {
  satirSayisi: number;
  toplamNufus: number;
  toplamAbone: number;
  varNufus: number;
  yokNufus: number;
  kismiNufus: number;
  digerNufus: number;
  varYuzde: number | null;
  yokYuzde: number | null;
  kismiYuzde: number | null;
  digerYuzde: number | null;
};

/**
 * VAR-YOK sayfasındaki plan nüfusunu üst ilçe/mahalle filtresine göre toplar;
 * yüzdeler yalnızca bu satırların nüfus toplamına göredir.
 */
export function aggregateKanalHatVarYok(
  blok: { sheetLabel: string; satirlar: KanalHatVarYokSatiri[] } | undefined | null,
  ilce: string,
  mahalle: string
): KanalHatVarYokOzet | null {
  if (!blok?.satirlar?.length) return null;
  const il = ilce.trim();
  const mh = mahalle.trim();
  const rows = blok.satirlar.filter(
    (r) => (!il || r.ilce === il) && (!mh || r.mahalle === mh)
  );
  if (!rows.length) return null;

  let varN = 0;
  let yokN = 0;
  let kismiN = 0;
  let digerN = 0;
  let aboneTop = 0;
  for (const r of rows) {
    if (r.durum === "var") varN += r.nufus;
    else if (r.durum === "yok") yokN += r.nufus;
    else if (r.durum === "kismi") kismiN += r.nufus;
    else digerN += r.nufus;
    if (r.abone != null) aboneTop += r.abone;
  }
  const toplamNufus = varN + yokN + kismiN + digerN;
  const pct = (n: number) =>
    toplamNufus > 0 ? (n / toplamNufus) * 100 : null;
  return {
    satirSayisi: rows.length,
    toplamNufus,
    toplamAbone: aboneTop,
    varNufus: varN,
    yokNufus: yokN,
    kismiNufus: kismiN,
    digerNufus: digerN,
    varYuzde: pct(varN),
    yokYuzde: pct(yokN),
    kismiYuzde: pct(kismiN),
    digerYuzde: pct(digerN),
  };
}

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
  toplamFatura: number;
  toplamM3: number;
  /** Okuma / Abone × 100 (tek ay için anlamlı oran) */
  okumaOrani: number;
  /** (Abone − Okuma) / Abone × 100 */
  okunamayanYuzde: number;
  /** Fatura / Okuma × 100 (faturalama başarısı) */
  faturaBasarisi: number;
  /** Okuma oranına göre azalan sıra; 1 = en yüksek */
  basariSirasi: number;
};

export type IlcePerformansToplam = {
  toplamAbone: number;
  toplamOkuma: number;
  toplamFatura: number;
  okumaOrani: number;
  okunamayanYuzde: number;
  faturaBasarisi: number;
};

export function computeIlcePerformans(
  records: DashboardRecord[],
  mod: IlcePerformansMod
): { satirlar: IlcePerformansSatiri[]; toplam: IlcePerformansToplam } {
  const acc = new Map<
    string,
    { abone: number; okuma: number; fatura: number; m3: number }
  >();

  for (const r of records) {
    const ilce = r.ilce?.trim();
    if (!ilce) continue;
    if (!acc.has(ilce)) {
      acc.set(ilce, { abone: 0, okuma: 0, fatura: 0, m3: 0 });
    }
    const b = acc.get(ilce)!;
    b.abone += r.abone;

    if (mod.tur === "yillik") {
      for (let i = 0; i < 12; i++) {
        const c = r.monthly[i];
        if (c?.okuma != null) b.okuma += c.okuma;
        if (c?.fatura != null) b.fatura += c.fatura;
        if (c?.m3 != null) b.m3 += c.m3;
      }
    } else {
      const c = r.monthly[mod.ayIndeks];
      if (c?.okuma != null) b.okuma += c.okuma;
      if (c?.fatura != null) b.fatura += c.fatura;
      if (c?.m3 != null) b.m3 += c.m3;
    }
  }

  const ayCount = mod.tur === "yillik" ? 12 : 1;

  const satirlar: IlcePerformansSatiri[] = [];
  let genelAbone = 0;
  let genelOkuma = 0;
  let genelFatura = 0;

  for (const [ilce, v] of acc) {
    if (v.abone <= 0) continue;
    const abonePeriod = v.abone * ayCount;
    const okumaOrani = abonePeriod > 0 ? (v.okuma / abonePeriod) * 100 : 0;
    const okunamayanYuzde = abonePeriod > 0 ? ((abonePeriod - v.okuma) / abonePeriod) * 100 : 100;
    const faturaBasarisi = v.okuma > 0 ? (v.fatura / v.okuma) * 100 : 0;
    satirlar.push({
      ilce,
      toplamAbone: v.abone,
      toplamOkuma: v.okuma,
      toplamFatura: v.fatura,
      toplamM3: v.m3,
      okumaOrani,
      okunamayanYuzde,
      faturaBasarisi,
      basariSirasi: 0,
    });
    genelAbone += v.abone;
    genelOkuma += v.okuma;
    genelFatura += v.fatura;
  }

  satirlar.sort((a, b) => b.okumaOrani - a.okumaOrani);
  const sorted = satirlar.map((row, i) => ({ ...row, basariSirasi: i + 1 }));

  const genelAbonePeriod = genelAbone * ayCount;
  const toplam: IlcePerformansToplam = {
    toplamAbone: genelAbone,
    toplamOkuma: genelOkuma,
    toplamFatura: genelFatura,
    okumaOrani: genelAbonePeriod > 0 ? (genelOkuma / genelAbonePeriod) * 100 : 0,
    okunamayanYuzde: genelAbonePeriod > 0 ? ((genelAbonePeriod - genelOkuma) / genelAbonePeriod) * 100 : 100,
    faturaBasarisi: genelOkuma > 0 ? (genelFatura / genelOkuma) * 100 : 0,
  };

  return { satirlar: sorted, toplam };
}

/** Excel elektrik sayfaları ile pano `mahalleKey` uyumu (parse-excel.mjs ile aynı) */
function elektrikNormKey(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/-/g, "");
}

function elektrikAsciiFoldTr(s: string): string {
  return s
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function stripElektrikMahalleSuffix(s: string): string {
  return s
    .trim()
    .replace(/\s+MAHALLESİ\s*$/iu, "")
    .replace(/\s+MAH\.\s*$/iu, "")
    .replace(/\s+MAH\s*$/iu, "")
    .trim();
}

/** İlçe + mahalle için `byKonumAylik` anahtarı (parse `mahalleKey` ile aynı) */
/** Seçilen yıl + ilçe filtresine göre yakıt TL (mahalle yok; ilçe MERKEZ dahil Excel satırıyla eşleşir) */
export function yakitTahakkukuForPeriod(
  yakit: DashboardPayload["yakit"] | undefined,
  selectedYear: number,
  ilceFilter: string
): number {
  if (!yakit || selectedYear !== yakit.yakitYear) return 0;
  const t = ilceFilter.trim();
  if (t) return yakit.byIlce[t]?.toplamYakitTahakkuku ?? 0;
  return yakit.toplamYakitTahakkuku;
}

export function elektrikKonumAnahtari(ilce: string, mahalle: string): string {
  const fold = (s: string) =>
    elektrikAsciiFoldTr(elektrikNormKey(s)).replace(/ı/g, "i");
  return `${fold(ilce)}|${fold(stripElektrikMahalleSuffix(mahalle))}`;
}

/** Elektrik satırı: seçilen dönem (yıllık / tek ay) için kWh ve tahakkuk */
export function elektrikDetayDonemToplam(
  d: ElektrikDetaySatiri,
  isYearly: boolean,
  monthIndex: number
): { kwh: number; tahakkuk: number } {
  const aylik = d.aylikToplam;
  if (aylik && aylik.length === 12) {
    if (isYearly) {
      return aylik.reduce(
        (acc, c) => ({
          kwh: acc.kwh + c.kwh,
          tahakkuk: acc.tahakkuk + c.tahakkuk,
        }),
        { kwh: 0, tahakkuk: 0 }
      );
    }
    return aylik[monthIndex] ?? { kwh: 0, tahakkuk: 0 };
  }
  if (isYearly) {
    return { kwh: d.totalKwh, tahakkuk: d.totalTahakkuk };
  }
  return { kwh: 0, tahakkuk: 0 };
}

function elektrikIlceAylikGet(
  d: ElektrikDetaySatiri,
  ilce: string
): ElektrikAylikHucre[] | null {
  const b = d.byIlceAylik?.[ilce]?.aylik;
  return b && b.length === 12 ? b : null;
}

/** İlçe + dönem için tek elektrik birimi (yağmur/kanal/içme) */
export function elektrikDetayIlceDonem(
  d: ElektrikDetaySatiri,
  ilce: string,
  isYearly: boolean,
  monthIndex: number
): { kwh: number; tahakkuk: number; count: number } {
  const count = d.byIlce?.[ilce]?.count ?? 0;
  const aylik = elektrikIlceAylikGet(d, ilce);
  if (aylik) {
    if (isYearly) {
      return {
        count,
        ...aylik.reduce(
          (acc, c) => ({
            kwh: acc.kwh + c.kwh,
            tahakkuk: acc.tahakkuk + c.tahakkuk,
          }),
          { kwh: 0, tahakkuk: 0 }
        ),
      };
    }
    return { count, ...(aylik[monthIndex] ?? { kwh: 0, tahakkuk: 0 }) };
  }
  const bi = d.byIlce?.[ilce];
  if (!bi) return { kwh: 0, tahakkuk: 0, count: 0 };
  if (isYearly) return { kwh: bi.kwh, tahakkuk: bi.tahakkuk, count: bi.count };
  return { kwh: 0, tahakkuk: 0, count: bi.count };
}

function elektrikKonumAylikGet(
  d: ElektrikDetaySatiri,
  ilce: string,
  mahalle: string
): ElektrikAylikHucre[] | null {
  const key = elektrikKonumAnahtari(ilce, mahalle);
  const b = d.byKonumAylik?.[key]?.aylik;
  return b && b.length === 12 ? b : null;
}

/** İlçe + mahalle + dönem (Excel’deki konum satırları) */
export function elektrikDetayKonumDonem(
  d: ElektrikDetaySatiri,
  ilce: string,
  mahalle: string,
  isYearly: boolean,
  monthIndex: number
): { kwh: number; tahakkuk: number; count: number } {
  const count = d.byKonumAylik?.[elektrikKonumAnahtari(ilce, mahalle)]?.count ?? 0;
  const aylik = elektrikKonumAylikGet(d, ilce, mahalle);
  if (aylik) {
    if (isYearly) {
      return {
        count,
        ...aylik.reduce(
          (acc, c) => ({
            kwh: acc.kwh + c.kwh,
            tahakkuk: acc.tahakkuk + c.tahakkuk,
          }),
          { kwh: 0, tahakkuk: 0 }
        ),
      };
    }
    return { count, ...(aylik[monthIndex] ?? { kwh: 0, tahakkuk: 0 }) };
  }
  return { kwh: 0, tahakkuk: 0, count: 0 };
}

function hatYilHucre(
  h: HatUzunlukHucre | null | undefined,
  yil: number
): HatYilDilimi {
  if (!h?.byYear) return { isletme: 0, yatirim: 0 };
  const pack = h.byYear as Record<string, HatYilDilimi>;
  return pack[String(yil)] ?? pack[yil] ?? { isletme: 0, yatirim: 0 };
}

export type HatHucreYilOzeti = {
  ekMetre: number;
  isletme: number;
  yatirim: number;
  isletmeYuzde: number | null;
  yatirimYuzde: number | null;
};

/** Tüm yılların işletme + yatırım eklemeleri (satırdaki toplam; Excel ile uyumlu) */
export function hatHucreTumYillarOzeti(
  h: HatUzunlukHucre | null | undefined
): HatHucreYilOzeti {
  if (!h) {
    return {
      ekMetre: 0,
      isletme: 0,
      yatirim: 0,
      isletmeYuzde: null,
      yatirimYuzde: null,
    };
  }
  const is = h.isletme;
  const ya = h.yatirim;
  const ek = is + ya;
  return {
    ekMetre: ek,
    isletme: is,
    yatirim: ya,
    isletmeYuzde: ek > 0 ? (is / ek) * 100 : null,
    yatirimYuzde: ek > 0 ? (ya / ek) * 100 : null,
  };
}

/**
 * Seçilen yıl için eklenen hat (m) ve işletme / yatırım yüzdeleri.
 * `mevcutKovasiYili` (genelde 2013): Excel "< 2013" sütununda yalnızca mevcut hat varsa
 * ek metre olarak mevcut stoku gösterir; % yoktur.
 */
export function hatHucreYilOzeti(
  h: HatUzunlukHucre | null | undefined,
  yil: number,
  mevcutKovasiYili?: number | null
): HatHucreYilOzeti {
  const { isletme, yatirim } = hatYilHucre(h, yil);
  let ekMetre = isletme + yatirim;
  if (
    ekMetre <= 0 &&
    mevcutKovasiYili != null &&
    yil === mevcutKovasiYili &&
    h?.mevcut != null &&
    h.mevcut > 0
  ) {
    ekMetre = h.mevcut;
  }
  const ext = isletme + yatirim;
  const yuzdeGecerli = ext > 0;
  return {
    ekMetre,
    isletme,
    yatirim,
    isletmeYuzde: yuzdeGecerli ? (isletme / ext) * 100 : null,
    yatirimYuzde: yuzdeGecerli ? (yatirim / ext) * 100 : null,
  };
}
