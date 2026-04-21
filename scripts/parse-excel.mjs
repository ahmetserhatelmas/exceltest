import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const xlsxPath =
  process.env.EXCEL_SOURCE_PATH ?? "/Users/ase/Downloads/Veri son.xlsx";
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

function readElektrikSheetSummary(wb, sheetName, label) {
  const rows = readRows(wb, sheetName);
  if (rows.length < 2) {
    return { label, totalKwh: 0, totalTahakkuk: 0, count: 0 };
  }
  const headers = rows[0].map((h) => normKey(h));
  const kwhIdx = [];
  const tlIdx = [];
  headers.forEach((h, i) => {
    if (h.includes("kwh")) kwhIdx.push(i);
    if (h.endsWith("tl")) tlIdx.push(i);
  });

  let totalKwh = 0;
  let totalTahakkuk = 0;
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    let rowHasData = false;
    for (const idx of kwhIdx) {
      const v = num(r[idx]);
      if (v != null) {
        totalKwh += v;
        rowHasData = true;
      }
    }
    for (const idx of tlIdx) {
      const v = num(r[idx]);
      if (v != null) {
        totalTahakkuk += v;
        rowHasData = true;
      }
    }
    if (rowHasData) count += 1;
  }

  return { label, totalKwh, totalTahakkuk, count };
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
      "Yagmur Suyu"
    ),
    readElektrikSheetSummary(
      wb,
      "KANALİZASYON ELEKTRİK TÜKETİM",
      "Kanalizasyon"
    ),
    readElektrikSheetSummary(wb, "İÇME SUYU ELEKTRİK TÜKETİM", "Icme Suyu"),
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
    },
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
