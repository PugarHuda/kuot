import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { DashboardTour } from "@/components/DashboardTour";

const MOBILE_NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/research", label: "Research" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/bounties", label: "Bounties" },
  { href: "/dashboard/claim", label: "Claim" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        {/* Mobile-only top nav (the sidebar is hidden under md). */}
        <div className="sticky top-0 z-20 flex items-center gap-3 overflow-x-auto border-b border-[var(--rule)] bg-[var(--paper-2)] px-4 py-2.5 md:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={20} height={20} />
            <span className="serif text-sm font-semibold">Kuot</span>
          </Link>
          <nav className="flex items-center gap-1">
            {MOBILE_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--ink)]/70 transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
      <DashboardTour />
    </div>
  );
}
