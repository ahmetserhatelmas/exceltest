import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const dashboardPath = path.join(root, "data", "dashboard.json");

function readPayload() {
  if (!fs.existsSync(dashboardPath)) {
    throw new Error("data/dashboard.json bulunamadı. Önce `npm run data` çalıştırın.");
  }
  return JSON.parse(fs.readFileSync(dashboardPath, "utf-8"));
}

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY env değişkenleri gerekli."
    );
  }

  const payload = readPayload();
  const dataYear = Number(payload.dataYear ?? new Date().getFullYear());
  const sourceFile = String(payload.sourceFile ?? "Veri son.xlsx");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from("dashboard_payloads").upsert(
    {
      data_year: dataYear,
      source_file: sourceFile,
      payload,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "data_year" }
  );

  if (error) throw error;
  console.log(`Supabase senkron tamam: year=${dataYear}, source=${sourceFile}`);
}

main().catch((err) => {
  console.error("Supabase sync hatası:", err.message);
  process.exit(1);
});

