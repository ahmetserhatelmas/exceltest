import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const xlsxPath = path.join(root, "data", "Veri.xlsx");
/** Ayrı nüfus tablosu (tercih edilir). Yoksa Veri.xlsx içindeki "NÜFUS" sayfası kullanılır. */
const nufusXlsxPath = path.join(root, "data", "Nufus.xlsx");
const outPath = path.join(root, "data", "dashboard.json");

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

function normKey(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .replace(/\./g, "");
}

/** Excel'de "MAH.", "MAHALLESİ" ve ASCII/Tr harf farklarını tolere eder (ör. BAGLAR ≈ BAĞLAR). */
function stripMahalleSuffix(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/\s+MAHALLESİ\s*$/iu, "")
    .replace(/\s+MAH\.\s*$/iu, "")
    .replace(/\s+MAH\s*$/iu, "")
    .trim();
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

function nufusLookupKey(ilce, mahalle) {
  const i = asciiFoldTr(normKey(ilce));
  const m = asciiFoldTr(normKey(stripMahalleSuffix(mahalle)));
  return `${i}|${m}`;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "-" || t === "") return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function textCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function strCell(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Sayfa KAYNAK-TERFİ-DEPO: ilçe+mahalle anahtarına depo / kaynak / terfi adları */
function readKaynakDepoMap(wb) {
  const name = "KAYNAK-TERFİ-DEPO";
  if (!wb.SheetNames.includes(name)) return new Map();
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
  /** @type {Map<string, { depo: Set<string>, kaynak: Set<string>, terfi: Set<string> }>} */
  const map = new Map();

  function bucket(key) {
    if (!map.has(key))
      map.set(key, {
        depo: new Set(),
        kaynak: new Set(),
        terfi: new Set(),
      });
    return map.get(key);
  }

  function addRow(ilce, mahalle, depoAd, kaynakAd, terfiHat, terfiNokta) {
    const i = strCell(ilce);
    const m = strCell(mahalle);
    if (!i || !m) return;
    const key = nufusLookupKey(i, m);
    const b = bucket(key);
    const d = strCell(depoAd);
    const k = strCell(kaynakAd);
    if (d) b.depo.add(d);
    if (k) b.kaynak.add(k);
    const th = strCell(terfiHat);
    const tn = strCell(terfiNokta);
    if (th && tn) b.terfi.add(`${th} — ${tn}`);
    else if (th) b.terfi.add(th);
    else if (tn) b.terfi.add(tn);
  }

  for (let ri = 2; ri < rows.length; ri++) {
    const r = rows[ri];
    if (!r || r.length < 4) continue;
    const depoAd = r[1];
    const depoMah = r[2];
    const depoIlce = r[3];
    const kaynakAd = r[6];
    const kaynakMah = r[8];
    const kaynakIlce = r[9];
    const terfiHat = r[11];
    const terfiNokta = r[12];
    const terfiMah = r[13];
    const terfiIlce = r[14];

    addRow(depoIlce, depoMah, depoAd, kaynakAd, terfiHat, terfiNokta);
    addRow(kaynakIlce, kaynakMah, depoAd, kaynakAd, terfiHat, terfiNokta);
    addRow(terfiIlce, terfiMah, depoAd, kaynakAd, terfiHat, terfiNokta);
  }

  /** @type {Map<string, { depo: string, kaynak: string, terfi: string }>} */
  const out = new Map();
  for (const [key, b] of map) {
    const depo = [...b.depo].sort((a, x) => a.localeCompare(x, "tr-TR")).join("; ");
    const kaynak = [...b.kaynak]
      .sort((a, x) => a.localeCompare(x, "tr-TR"))
      .join("; ");
    const terfi = [...b.terfi]
      .sort((a, x) => a.localeCompare(x, "tr-TR"))
      .join("; ");
    if (depo || kaynak || terfi) out.set(key, { depo, kaynak, terfi });
  }
  return out;
}

function readNufusMapFromWorkbook(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 4) continue;
    const mahalle = r[1];
    const ilce = r[2];
    const nufus = num(r[3]);
    if (typeof mahalle !== "string" || typeof ilce !== "string" || nufus == null)
      continue;
    const key = nufusLookupKey(ilce, mahalle);
    map.set(key, nufus);
  }
  return map;
}

function resolveNufusSheetName(wb) {
  if (wb.SheetNames.includes("Sheet1")) return "Sheet1";
  if (wb.SheetNames.includes("NÜFUS")) return "NÜFUS";
  return wb.SheetNames[0] ?? null;
}

function loadNufusMap() {
  if (fs.existsSync(nufusXlsxPath)) {
    const wb = XLSX.readFile(nufusXlsxPath, { cellDates: true });
    const name = resolveNufusSheetName(wb);
    if (!name) return { map: new Map(), source: nufusXlsxPath, sheet: null };
    const map = readNufusMapFromWorkbook(wb, name);
    return { map, source: nufusXlsxPath, sheet: name };
  }
  return { map: null, source: null, sheet: null };
}

function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error("Bulunamadı:", xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const ws = wb.Sheets["Sayfa1"];
  if (!ws) {
    console.error("Sayfa1 yok");
    process.exit(1);
  }

  const nufusLoaded = loadNufusMap();
  let nufusMap;
  let nufusSourceLabel;
  if (nufusLoaded.map != null) {
    nufusMap = nufusLoaded.map;
    nufusSourceLabel = `${path.basename(nufusLoaded.source)} (${nufusLoaded.sheet})`;
  } else {
    nufusMap = readNufusMapFromWorkbook(wb, "NÜFUS");
    nufusSourceLabel = "Veri.xlsx (NÜFUS)";
  }

  const kaynakDepoMap = readKaynakDepoMap(wb);
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  const records = [];
  const ilceSet = new Set();
  const mahalleByIlce = new Map();

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 6) continue;

    const mahalle = r[3];
    const ilce = r[4];
    if (typeof mahalle !== "string" || typeof ilce !== "string") continue;

    const abone = num(r[5]);
    if (abone == null || abone <= 0) continue;

    const monthly = [];
    for (let m = 0; m < 12; m++) {
      const c = 6 + m * 4;
      monthly.push({
        okuma: num(r[c]),
        fatura: num(r[c + 1]),
        m3: num(r[c + 2]),
        tahakkuk: num(r[c + 3]),
      });
    }

    const lk = nufusLookupKey(ilce, mahalle);
    const nufus = nufusMap.get(lk) ?? null;
    const kd = kaynakDepoMap.get(lk) ?? null;

    const defterNo = num(r[0]);
    const muhtar = textCell(r[1]);
    const telefon = textCell(r[2]);

    records.push({
      defterNo: defterNo ?? i,
      mahalle: mahalle.trim(),
      ilce: ilce.trim(),
      muhtar,
      telefon,
      abone,
      nufus,
      kaynakDepo: kd,
      monthly,
    });

    ilceSet.add(ilce.trim());
    if (!mahalleByIlce.has(ilce.trim())) mahalleByIlce.set(ilce.trim(), new Set());
    mahalleByIlce.get(ilce.trim()).add(mahalle.trim());
  }

  const ilceler = [...ilceSet].sort((a, b) =>
    a.localeCompare(b, "tr-TR")
  );
  const mahalleler = {};
  for (const [il, set] of mahalleByIlce) {
    mahalleler[il] = [...set].sort((a, b) => a.localeCompare(b, "tr-TR"));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    nufusKaynak: nufusSourceLabel,
    months: MONTHS_TR,
    ilceler,
    mahalleler,
    records,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), "utf-8");
  const withNufus = records.filter((r) => r.nufus != null).length;
  const withKd = records.filter((r) => r.kaynakDepo != null).length;
  console.log(
    "Yazıldı:",
    outPath,
    "kayıt:",
    records.length,
    "nüfus:",
    withNufus,
    "kaynak/depo:",
    withKd,
    "|",
    nufusSourceLabel
  );
}

main();
