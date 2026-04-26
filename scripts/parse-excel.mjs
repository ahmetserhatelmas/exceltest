import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const xlsxPath =
  process.env.EXCEL_SOURCE_PATH ?? path.join(root, "data", "Veri son (2).xlsx");
const outPath = path.join(root, "data", "dashboard.json");
const DATA_YEAR = Number(process.env.DATA_YEAR ?? "2025");
const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "-") return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Metre gibi tam sayı hücreleri (Excel metin: "1,390,226") */
function numMetre(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const t = v.trim().replace(/\s/g, "").replace(/₺/g, "");
    if (!t || t === "-") return null;
    const n = Number(t.replace(/\./g, "").replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function textCell(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normKey(s) {
  return textCell(s)
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/-/g, "");
}

function asciiFoldTr(s) {
  return s
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function stripMahalleSuffix(s) {
  return textCell(s)
    .replace(/\s+MAHALLESİ\s*$/iu, "")
    .replace(/\s+MAH\.\s*$/iu, "")
    .replace(/\s+MAH\s*$/iu, "")
    .trim();
}

function mahalleKey(ilce, mahalle) {
  return `${asciiFoldTr(normKey(ilce))}|${asciiFoldTr(
    normKey(stripMahalleSuffix(mahalle))
  )}`;
}

const NUFUS_LOOKUP_ALIAS = {
  "tarsus|82evler": "tarsus|seksenikievler",
};

function lookupNufus(map, key) {
  const direct = map.get(key);
  if (direct != null) return direct;
  const aliasKey = NUFUS_LOOKUP_ALIAS[key];
  return aliasKey ? map.get(aliasKey) ?? null : null;
}

function readRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function readNufus(wb) {
  const rows = readRows(wb, "NÜFUS");
  const map = new Map();
  const byIlce = {};
  let toplam = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const mahalle = r[0];
    const ilce = r[1];
    const nufus = num(r[2]);
    if (!textCell(mahalle) || !textCell(ilce) || nufus == null) continue;
    map.set(mahalleKey(ilce, mahalle), nufus);
    const ilceLabel = textCell(ilce).toLocaleUpperCase("tr-TR");
    byIlce[ilceLabel] = (byIlce[ilceLabel] ?? 0) + nufus;
    toplam += nufus;
  }
  return { map, toplam, byIlce };
}

function ensureBucket(map, key) {
  if (!map.has(key)) {
    map.set(key, { depo: new Set(), kaynak: new Set(), terfi: new Set() });
  }
  return map.get(key);
}

function readAltyapiMap(wb) {
  const map = new Map();
  const kaynakRows = readRows(wb, "KAYNAK");
  for (let i = 1; i < kaynakRows.length; i++) {
    const r = kaynakRows[i];
    if (!r) continue;
    const key = mahalleKey(r[4], r[3]);
    if (!key || key === "|") continue;
    const b = ensureBucket(map, key);
    const ad = textCell(r[1]);
    if (ad) b.kaynak.add(ad);
  }

  const depoRows = readRows(wb, "DEPO");
  for (let i = 1; i < depoRows.length; i++) {
    const r = depoRows[i];
    if (!r) continue;
    const key = mahalleKey(r[3], r[2]);
    if (!key || key === "|") continue;
    const b = ensureBucket(map, key);
    const ad = textCell(r[1]);
    if (ad) b.depo.add(ad);
  }

  const terfiRows = readRows(wb, "İÇME SUYU TERFİ");
  for (let i = 1; i < terfiRows.length; i++) {
    const r = terfiRows[i];
    if (!r) continue;
    const key = mahalleKey(r[3], r[2]);
    if (!key || key === "|") continue;
    const b = ensureBucket(map, key);
    const ad = textCell(r[1]);
    if (ad) b.terfi.add(ad);
  }

  const out = new Map();
  for (const [k, v] of map) {
    out.set(k, {
      depo: [...v.depo].sort((a, b) => a.localeCompare(b, "tr-TR")).join("; "),
      kaynak: [...v.kaynak]
        .sort((a, b) => a.localeCompare(b, "tr-TR"))
        .join("; "),
      terfi: [...v.terfi]
        .sort((a, b) => a.localeCompare(b, "tr-TR"))
        .join("; "),
    });
  }
  return out;
}

/** Ay adı + kWh / TL sütun indeksleri (Elektrik sayfaları) */
function findElektrikAySutunlari(headerRow) {
  const aylikKwh = new Array(12).fill(-1);
  const aylikTl = new Array(12).fill(-1);
  if (!headerRow?.length) {
    return { hasAylik: false, aylikKwh, aylikTl };
  }
  const normHeaders = headerRow.map((h) => normKey(h));
  for (let m = 0; m < 12; m++) {
    const wantK = normKey(`${MONTHS_TR[m]} kWh`);
    const wantT = normKey(`${MONTHS_TR[m]} TL`);
    let ik = -1;
    let it = -1;
    for (let c = 0; c < normHeaders.length; c++) {
      if (normHeaders[c] === wantK) ik = c;
      if (normHeaders[c] === wantT) it = c;
    }
    aylikKwh[m] = ik;
    aylikTl[m] = it;
  }
  const hasAylik = aylikKwh.some((c) => c >= 0);
  return { hasAylik, aylikKwh, aylikTl };
}

function emptyAylik12() {
  return Array.from({ length: 12 }, () => ({ kwh: 0, tahakkuk: 0 }));
}

function readElektrikSheetSummary(wb, sheetName, label, key) {
  const rows = readRows(wb, sheetName);
  if (rows.length < 2) {
    return {
      key,
      label,
      totalKwh: 0,
      totalTahakkuk: 0,
      count: 0,
      byIlce: {},
      aylikToplam: emptyAylik12(),
      byIlceAylik: {},
    };
  }
  const headerCells = rows[0] ?? [];
  const headers = headerCells.map((h) => normKey(h));
  const { hasAylik, aylikKwh, aylikTl } = findElektrikAySutunlari(headerCells);

  const kwhIdxLegacy = [];
  const tlIdxLegacy = [];
  let ilceIdx = headers.findIndex((h) => h === "ilçe");
  if (ilceIdx < 0) {
    ilceIdx = headers.findIndex((h) => {
      if (!h.includes("ilçe")) return false;
      return !h.includes("enerji");
    });
  }
  headers.forEach((h, i) => {
    if (h.includes("kwh")) kwhIdxLegacy.push(i);
    if (h.endsWith("tl")) tlIdxLegacy.push(i);
  });

  let totalKwh = 0;
  let totalTahakkuk = 0;
  let count = 0;
  const byIlce = {};
  const aylikToplam = emptyAylik12();
  const byIlceAylik = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const ilceRaw =
      ilceIdx >= 0 ? textCell(r[ilceIdx]).toLocaleUpperCase("tr-TR") : "";
    const ilce = ilceRaw || "BİLİNMİYOR";
    let rowHasData = false;
    let rowKwh = 0;
    let rowTl = 0;

    if (hasAylik) {
      const rowAylik = emptyAylik12();
      for (let m = 0; m < 12; m++) {
        const ik = aylikKwh[m];
        const it = aylikTl[m];
        const kv = ik >= 0 ? num(r[ik]) : null;
        const tv = it >= 0 ? num(r[it]) : null;
        if (kv != null) {
          totalKwh += kv;
          rowKwh += kv;
          aylikToplam[m].kwh += kv;
          rowAylik[m].kwh += kv;
          rowHasData = true;
        }
        if (tv != null) {
          totalTahakkuk += tv;
          rowTl += tv;
          aylikToplam[m].tahakkuk += tv;
          rowAylik[m].tahakkuk += tv;
          rowHasData = true;
        }
      }
      if (rowHasData) {
        if (!byIlceAylik[ilce]) {
          byIlceAylik[ilce] = { count: 0, aylik: emptyAylik12() };
        }
        byIlceAylik[ilce].count += 1;
        for (let m = 0; m < 12; m++) {
          byIlceAylik[ilce].aylik[m].kwh += rowAylik[m].kwh;
          byIlceAylik[ilce].aylik[m].tahakkuk += rowAylik[m].tahakkuk;
        }
      }
    } else {
      for (const idx of kwhIdxLegacy) {
        const v = num(r[idx]);
        if (v != null) {
          totalKwh += v;
          rowKwh += v;
          rowHasData = true;
        }
      }
      for (const idx of tlIdxLegacy) {
        const v = num(r[idx]);
        if (v != null) {
          totalTahakkuk += v;
          rowTl += v;
          rowHasData = true;
        }
      }
    }

    if (rowHasData) {
      count += 1;
      if (!byIlce[ilce]) byIlce[ilce] = { kwh: 0, tahakkuk: 0, count: 0 };
      byIlce[ilce].kwh += rowKwh;
      byIlce[ilce].tahakkuk += rowTl;
      byIlce[ilce].count += 1;
    }
  }

  return {
    key,
    label,
    totalKwh,
    totalTahakkuk,
    count,
    byIlce,
    aylikToplam: hasAylik ? aylikToplam : null,
    byIlceAylik: hasAylik ? byIlceAylik : null,
  };
}

/** Üst başlıktaki yıl hücresi → sayı (2014); "< 2013" gibi değerler 2013 kovası */
function parseHatYilHucre(cell) {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const t = textCell(cell);
  if (!t) return null;
  const f = asciiFoldTr(normKey(t));
  if (f.includes("<") || f.includes("kucuk")) {
    const digits = t.match(/\d{4}/);
    if (digits) return Number(digits[0]);
    return 2013;
  }
  const n = Number(String(cell).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** İçme / Kanal / Yağmur hat uzunluğu sayfaları (İLÇE + yıllık İŞLETME/YATIRIM + TOPLAM sütunu) */
function readHatUzunlukByIlce(wb, sheetName) {
  const rows = readRows(wb, sheetName);
  if (rows.length < 3) return {};
  const h0 = rows[0] ?? [];
  const h1 = rows[1] ?? [];
  let toplamCol = -1;
  for (let j = h0.length - 1; j >= 1; j--) {
    const cell = h0[j];
    if (cell == null || cell === "") continue;
    const fold = asciiFoldTr(normKey(String(cell)));
    if (fold.includes("toplam")) {
      toplamCol = j;
      break;
    }
  }
  if (toplamCol < 0) {
    const sample = rows[2] ?? [];
    toplamCol = Math.max(0, sample.length - 1);
  }

  const out = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r?.length) continue;
    const ilceRaw = textCell(r[0]).toLocaleUpperCase("tr-TR");
    if (!ilceRaw) continue;
    const foldIlce = asciiFoldTr(normKey(ilceRaw));
    if (foldIlce.includes("toplam") || foldIlce.includes("genel")) continue;

    const mevcut = numMetre(r[1]);
    const byYear = {};
    let aktifYil = null;
    for (let j = 2; j < toplamCol; j++) {
      const yCand = parseHatYilHucre(h0[j]);
      if (yCand != null) aktifYil = yCand;
      if (aktifYil == null) continue;
      const lab = textCell(h1[j]).toLocaleUpperCase("tr-TR");
      const v = numMetre(r[j]);
      if (v == null) continue;
      if (!byYear[aktifYil]) byYear[aktifYil] = { isletme: 0, yatirim: 0 };
      if (lab.includes("İŞLETME") || lab.includes("ISLETME")) {
        byYear[aktifYil].isletme += v;
      } else if (lab.includes("YATIRIM")) {
        byYear[aktifYil].yatirim += v;
      }
    }
    const toplam = numMetre(r[toplamCol]);
    let isletme = 0;
    let yatirim = 0;
    for (const y of Object.keys(byYear)) {
      isletme += byYear[y].isletme;
      yatirim += byYear[y].yatirim;
    }
    out[ilceRaw] = { mevcut, isletme, yatirim, toplam, byYear };
  }
  return out;
}

function mergeHatUzunlukPayload(icmeByIlce, kanalByIlce, yagmurByIlce) {
  const ilceSet = new Set([
    ...Object.keys(icmeByIlce),
    ...Object.keys(kanalByIlce),
    ...Object.keys(yagmurByIlce),
  ]);
  const ilceler = [...ilceSet].sort((a, b) => a.localeCompare(b, "tr-TR"));
  const satirlar = ilceler.map((ilce) => ({
    ilce,
    icmeSuyu: icmeByIlce[ilce] ?? null,
    kanalizasyon: kanalByIlce[ilce] ?? null,
    yagmurSuyu: yagmurByIlce[ilce] ?? null,
  }));

  const sumToplam = (by) =>
    Object.values(by).reduce((s, x) => s + (x?.toplam ?? 0), 0);

  const yilSet = new Set();
  const yilTopla = (by) => {
    for (const x of Object.values(by)) {
      if (!x?.byYear) continue;
      for (const y of Object.keys(x.byYear)) yilSet.add(Number(y));
    }
  };
  yilTopla(icmeByIlce);
  yilTopla(kanalByIlce);
  yilTopla(yagmurByIlce);
  const yillar = [...yilSet].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);

  return {
    sheets: {
      icmeSuyu: "İçme Suyu Hat Uzunluğu",
      kanalizasyon: "Kanalizasyon Hat Uzunluğu",
      yagmurSuyu: "Yağmur Suyu Hat Uzunluğu",
    },
    ilceler: satirlar,
    yillar,
    ozet: {
      icmeSuyuMetre: sumToplam(icmeByIlce),
      kanalizasyonMetre: sumToplam(kanalByIlce),
      yagmurSuyuMetre: sumToplam(yagmurByIlce),
      kanalizasyonIsletmeYuzde: null,
      kanalizasyonYatirimYuzde: null,
    },
  };
}

function readAboneRecords(wb, nufusMap, altyapiMap) {
  const rows = readRows(wb, "ABONE");
  const records = [];
  const ilceSet = new Set();
  const mahalleByIlce = new Map();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 6) continue;
    const mahalle = textCell(r[3]);
    const ilce = textCell(r[4]).toLocaleUpperCase("tr-TR");
    if (!mahalle || !ilce) continue;
    const muhtar = textCell(r[1]);
    const telefon = textCell(r[2]);
    const aboneRaw = num(r[5]);
    const abone = aboneRaw ?? 0;
    if (abone <= 0 && !muhtar) continue;

    const monthly = Array.from({ length: 12 }, (_, m) => {
      const c = 6 + m * 4;
      return {
        okuma: num(r[c]),
        fatura: num(r[c + 1]),
        m3: num(r[c + 2]),
        tahakkuk: num(r[c + 3]),
      };
    });

    const key = mahalleKey(ilce, mahalle);
    records.push({
      defterNo: num(r[0]) ?? i + 1,
      muhtar,
      telefon,
      mahalle,
      ilce,
      abone,
      nufus: lookupNufus(nufusMap, key),
      kaynakDepo: altyapiMap.get(key) ?? null,
      monthly,
    });

    ilceSet.add(ilce);
    if (!mahalleByIlce.has(ilce)) mahalleByIlce.set(ilce, new Set());
    mahalleByIlce.get(ilce).add(mahalle);
  }

  const ilceler = [...ilceSet].sort((a, b) => a.localeCompare(b, "tr-TR"));
  const mahalleler = {};
  for (const [ilce, set] of mahalleByIlce) {
    mahalleler[ilce] = [...set].sort((a, b) => a.localeCompare(b, "tr-TR"));
  }
  return { records, ilceler, mahalleler };
}

function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error("Excel dosyası bulunamadı:", xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const { map: nufusMap, toplam: nufusToplam, byIlce: nufusIlceToplam } =
    readNufus(wb);
  const altyapiMap = readAltyapiMap(wb);
  const { records, ilceler, mahalleler } = readAboneRecords(
    wb,
    nufusMap,
    altyapiMap
  );

  const elektrikDetay = [
    readElektrikSheetSummary(
      wb,
      "YAĞMUR SUYU ELEKTRİK TÜKETİM",
      "Yagmur Suyu",
      "yagmur"
    ),
    readElektrikSheetSummary(
      wb,
      "KANALİZASYON ELEKTRİK TÜKETİM",
      "Kanalizasyon",
      "kanalizasyon"
    ),
    readElektrikSheetSummary(
      wb,
      "İÇME SUYU ELEKTRİK TÜKETİM",
      "Icme Suyu",
      "icme"
    ),
  ];
  const toplamElektrikKwh = elektrikDetay.reduce((s, x) => s + x.totalKwh, 0);
  const toplamElektrikTahakkuk = elektrikDetay.reduce(
    (s, x) => s + x.totalTahakkuk,
    0
  );
  const toplamSuTahakkuk = records.reduce(
    (sum, r) =>
      sum + r.monthly.reduce((mSum, c) => mSum + (c.tahakkuk ?? 0), 0),
    0
  );

  const elektrikIlceMap = new Map();
  for (const d of elektrikDetay) {
    for (const [ilce, v] of Object.entries(d.byIlce)) {
      if (!elektrikIlceMap.has(ilce)) {
        elektrikIlceMap.set(ilce, {
          ilce,
          toplamKwh: 0,
          toplamTahakkuk: 0,
          yagmurKwh: 0,
          yagmurTahakkuk: 0,
          kanalizasyonKwh: 0,
          kanalizasyonTahakkuk: 0,
          icmeKwh: 0,
          icmeTahakkuk: 0,
        });
      }
      const row = elektrikIlceMap.get(ilce);
      row.toplamKwh += v.kwh;
      row.toplamTahakkuk += v.tahakkuk;
      if (d.key === "yagmur") {
        row.yagmurKwh += v.kwh;
        row.yagmurTahakkuk += v.tahakkuk;
      } else if (d.key === "kanalizasyon") {
        row.kanalizasyonKwh += v.kwh;
        row.kanalizasyonTahakkuk += v.tahakkuk;
      } else if (d.key === "icme") {
        row.icmeKwh += v.kwh;
        row.icmeTahakkuk += v.tahakkuk;
      }
    }
  }
  const elektrikIlceDetay = [...elektrikIlceMap.values()].sort((a, b) =>
    a.ilce.localeCompare(b.ilce, "tr-TR")
  );

  const icmeHat = readHatUzunlukByIlce(wb, "İçme Suyu Hat Uzunluğu");
  const kanalHat = readHatUzunlukByIlce(wb, "Kanalizasyon Hat Uzunluğu");
  const yagmurHat = readHatUzunlukByIlce(wb, "Yağmur Suyu Hat Uzunluğu");
  const hatUzunluklari = mergeHatUzunlukPayload(icmeHat, kanalHat, yagmurHat);

  const payload = {
    generatedAt: new Date().toISOString(),
    dataYear: DATA_YEAR,
    sourceFile: path.basename(xlsxPath),
    nufusKaynak: `${path.basename(xlsxPath)} (NÜFUS)`,
    nufusToplam,
    nufusIlceToplam,
    months: MONTHS_TR,
    ilceler,
    mahalleler,
    records,
    elektrik: {
      toplamElektrikTuketimiKwh: toplamElektrikKwh,
      toplamElektrikTahakkuku: toplamElektrikTahakkuk,
      toplamSuTahakkuku: toplamSuTahakkuk,
      netGelir: toplamSuTahakkuk - toplamElektrikTahakkuk,
      detay: elektrikDetay,
      ilceDetay: elektrikIlceDetay,
    },
    hatUzunluklari,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), "utf-8");
  console.log(
    "Yazıldı:",
    outPath,
    "| records:",
    records.length,
    "| nufusToplam:",
    nufusToplam
  );
}

main();
