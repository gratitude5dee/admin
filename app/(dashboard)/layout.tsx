import Link from "next/link";

const NAV = [
  { href: "/", label: "Boxes" },
  { href: "/tokens", label: "Tokens" },
  { href: "/connectors", label: "Connectors" },
  { href: "/skills", label: "Skills" },
  { href: "/traces", label: "Traces" },
  { href: "/costs", label: "Costs" },
  { href: "/feedback", label: "Feedback" },
  { href: "/learning", label: "Learning" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-6">
          <span className="font-mono text-sm text-foreground">
            wzrd.tech admin
          </span>
          <nav className="flex gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <form method="post" action="/api/logout">
          <button
            type="submit"
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        </form>
      </header>
      <main className="mt-6 space-y-6">{children}</main>
      <footer className="mt-10 border-t border-border pt-4">
        <p className="font-mono text-[10px] text-muted-foreground">
          Metadata and receipts only — no message content, prompts, or memory
          are stored or displayed (C4).
        </p>
      </footer>
    </div>
  );
}
