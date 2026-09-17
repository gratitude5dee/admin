import Link from "next/link";
import { groupHref, TOKENS_GROUP_TABS } from "@/lib/tokens";
import type { TokensGroup } from "@/lib/types";

/**
 * Tab strip over `?group=` (goal.md §3.3). Server-rendered links, the
 * RangeToggle pattern: each tab is a plain GET of the same page with the
 * group in the query string, so it works without client JavaScript and the
 * page's server component does every fetch.
 */
export function GroupTabs({
  group,
  basePath = "/tokens",
  tabs = TOKENS_GROUP_TABS,
}: {
  /** The active group (the page has already parsed and defaulted it). */
  group: TokensGroup;
  basePath?: string;
  tabs?: readonly TokensGroup[];
}) {
  return (
    <nav aria-label="group by" className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const active = tab === group;
        return (
          <Link
            key={tab}
            href={groupHref(basePath, tab)}
            aria-current={active ? "page" : undefined}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
              active
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </Link>
        );
      })}
    </nav>
  );
}
