import Link from "next/link";

/** User label that links to the per-user drill-down page. */
export function UserLink({ userId, label }: { userId: string; label: string }) {
  return (
    <Link
      href={`/users/${encodeURIComponent(userId)}`}
      className="text-sky-400 hover:underline"
    >
      {label}
    </Link>
  );
}
