import Dashboard from "@/components/Dashboard";
import type { DashboardPayload } from "@/lib/dashboard";
import dashboard from "@/data/dashboard.json";

export default function Home() {
  return <Dashboard data={dashboard as unknown as DashboardPayload} />;
}
