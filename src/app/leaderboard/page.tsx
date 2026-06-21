import { redirect } from "next/navigation";

// The leaderboard lives inside the dashboard; keep /leaderboard as a stable entry.
export default function LeaderboardRedirect() {
  redirect("/dashboard/activity");
}
