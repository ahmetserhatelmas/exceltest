import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultExcelPath = path.join(root, "data", "Veri son.xlsx");
const excelPath = process.env.EXCEL_SOURCE_PATH ?? defaultExcelPath;
const dashboardPath = path.join(root, "data", "dashboard.json");

if (fs.existsSync(excelPath)) {
  console.log(`[prebuild] Excel bulundu, parse çalıştırılıyor: ${excelPath}`);
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "parse-excel.mjs")], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

if (fs.existsSync(dashboardPath)) {
  console.log(
    `[prebuild] Excel bulunamadı (${excelPath}). Mevcut dashboard.json ile devam ediliyor.`
  );
  process.exit(0);
}

console.error(
  `[prebuild] Ne Excel bulundu ne dashboard.json. EXCEL_SOURCE_PATH ayarlayın veya data/dashboard.json ekleyin.`
);
process.exit(1);

