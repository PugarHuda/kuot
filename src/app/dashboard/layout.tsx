import { Sidebar } from "@/components/Sidebar";
import { DashboardTour } from "@/components/DashboardTour";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
      <DashboardTour />
    </div>
  );
}
