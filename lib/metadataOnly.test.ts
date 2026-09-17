/**
 * A1 guard (goal.md §2, C4): no dashboard page may render a content-bearing
 * field. The control plane's admin endpoints return metadata only, but if a
 * payload ever carried `prompt`, `plan`, `source`, `body` or `message`, the
 * page must drop it before render — so no page source may contain a JSX
 * expression that reads `.prompt`, `.plan`, `.source`, `.body` or `.message`
 * off a response object.
 *
 * The check is static: every `app/(dashboard)/**\/page.tsx` is scanned with
 * comments and string literals removed (the words are fine as table headers,
 * labels and notes), and every remaining `<something>.<forbidden>` member
 * access must be an entry in ALLOWED below, each with the reason it is not
 * content. An exception that no longer matches fails too, so the list cannot
 * go stale.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["prompt", "plan", "source", "body", "message"] as const;
const PAGES_ROOT = path.resolve(__dirname, "..", "app", "(dashboard)");

interface Allowed {
  /** Page path relative to app/(dashboard). */
  file: string;
  /** The exact member expression the scanner finds. */
  expression: string;
  /** Why this is metadata, not content. */
  reason: string;
}

const ALLOWED: readonly Allowed[] = [
  {
    file: "create/page.tsx",
    expression: "medians.plan",
    reason:
      "CreateOpsResponse.medians_s.plan is number | null — the median seconds an intake spends in `planning`, a counter that lib/createOps stripContentFields keeps by design.",
  },
  {
    file: "users/[id]/page.tsx",
    expression: "switchEligibility.message",
    reason:
      "Not a response field: tenkiSwitchEligibility (lib/providerSwitch.ts) returns a fixed operator-facing sentence computed from box metadata.",
  },
  {
    file: "feedback/page.tsx",
    expression: "item.body",
    reason:
      "FeedbackResponse.items[].body is the bug/feature report a user submitted to the operators through the in-air Feedback inbox (README › Panels); it is addressed to this dashboard, not agent-conversation content, and predates A1.",
  },
];

/** Every page.tsx under app/(dashboard), relative to that root. */
export function dashboardPages(root = PAGES_ROOT): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "page.tsx")
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name))
    )
    .sort();
}

/**
 * Removes comments and string literals from TSX source, keeping the
 * expressions inside template `${...}` holes so `${row.body}` is still seen.
 * JSX text between tags is left alone: it has no `.` member accesses that
 * the forbidden-name regex would read as code.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  // Template literals nest via ${ }; track the brace depth of each hole.
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch && source[j] !== "\n") {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      out += `${ch}${ch}`;
      i = j + 1;
      continue;
    }
    if (ch === "`") {
      let j = i + 1;
      let inner = "";
      while (j < n && source[j] !== "`") {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "$" && source[j + 1] === "{") {
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            if (source[k] === "{") depth += 1;
            else if (source[k] === "}") depth -= 1;
            k += 1;
          }
          inner += ` ${stripCommentsAndStrings(source.slice(j + 2, k - 1))} `;
          j = k;
          continue;
        }
        j += 1;
      }
      out += `\`${inner}\``;
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const MEMBER_ACCESS = new RegExp(
  String.raw`\b([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.(?:${FORBIDDEN.join("|")}))\b(?!\s*\()(?!\s*[:=][^=])`,
  "g"
);

/** `row["body"]`, `row['body']` and `row?.["body"]` read the same field as `row.body`; normalise before stripping. */
const BRACKET_ACCESS = new RegExp(
  String.raw`(\?\.)?\[\s*(["'])(${FORBIDDEN.join("|")})\2\s*\]`,
  "g"
);

/** Every `<obj>.<forbidden>` or `<obj>["<forbidden>"]` read in code (not comments, strings or labels). */
export function forbiddenAccesses(source: string): string[] {
  const normalised = source.replace(BRACKET_ACCESS, (_match, optional: string | undefined, _quote, key: string) =>
    `${optional ? "?." : "."}${key}`
  );
  const code = stripCommentsAndStrings(normalised);
  const found: string[] = [];
  for (const match of code.matchAll(MEMBER_ACCESS)) {
    found.push(match[1].replace(/\?\./g, "."));
  }
  return found;
}

describe("A1 metadata-only guard", () => {
  const pages = dashboardPages();

  it("scans every dashboard page", () => {
    expect(pages).toEqual(
      expect.arrayContaining([
        "page.tsx",
        "deployments/page.tsx",
        "create/page.tsx",
        "tokens/page.tsx",
        "fleet/page.tsx",
      ])
    );
  });

  it("finds a content read and ignores comments, headers and labels", () => {
    const sample = `
      // row.prompt is stripped upstream
      /* item.plan too */
      const headers = ["prompt", "body", "message"];
      <Stat label="message" title={\`plan for \${row.slug}\`} />
      <td>{row.body}</td>
      <td>{\`\${item.source}\`}</td>
      <td>{ops.medians_s?.plan}</td>
      <td>{format(row.message)}</td>
      const x = { body: 1, message: row.status };
      row.body = null;
      send.message(row)
      <td>{row["body"]}</td>
      <td>{item?.['message']}</td>
      const key = 'row["prompt"]';
    `;
    expect(forbiddenAccesses(sample)).toEqual([
      "row.body",
      "item.source",
      "ops.medians_s.plan",
      "row.message",
      "row.body",
      "item.message",
    ]);
  });

  it.each(pages)("%s renders no content field", (file) => {
    const source = readFileSync(path.join(PAGES_ROOT, file), "utf8");
    const allowed = ALLOWED.filter((entry) => entry.file === file).map(
      (entry) => entry.expression
    );
    const violations = forbiddenAccesses(source).filter(
      (expression) => !allowed.includes(expression)
    );
    expect(
      violations,
      `${file} reads a content-named field (${violations.join(", ")}); drop it before render (stripContentFields) or, if it is provably metadata, add an ALLOWED entry with the reason`
    ).toEqual([]);
  });

  it("keeps every allowed exception current", () => {
    for (const entry of ALLOWED) {
      expect(pages, `${entry.file} no longer exists`).toContain(entry.file);
      const source = readFileSync(path.join(PAGES_ROOT, entry.file), "utf8");
      expect(
        forbiddenAccesses(source),
        `${entry.file}: exception "${entry.expression}" no longer matches; remove it`
      ).toContain(entry.expression);
    }
  });
});
