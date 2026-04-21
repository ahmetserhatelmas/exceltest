import Dashboard from "@/components/Dashboard";
import type { DashboardPayload } from "@/lib/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase";
import dashboard from "@/data/dashboard.json";

async function getDashboardData(): Promise<DashboardPayload> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return dashboard as unknown as DashboardPayload;

  const { data, error } = await supabase
    .from("dashboard_payloads")
    .select("payload, data_year")
    .order("data_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.payload) {
    return dashboard as unknown as DashboardPayload;
  }

  return {
    ...(data.payload as DashboardPayload),
    dataYear: (data.payload as DashboardPayload).dataYear ?? data.data_year,
  };
}

export default async function Home() {
  const payload = await getDashboardData();
  return <Dashboard data={payload} />;
}
