/**
 * CSV/JSONL export proxy: streams the control plane's /api/admin/traces
 * export through the dashboard origin so the ADMIN_API_KEY stays server-side.
 * When WANDB_API_KEY is configured, exported receipt metadata is also
 * mirrored to W&B Weave (airv2's weave.ts pattern); dormant otherwise.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/controlPlane";
import { mirrorReceipts, weaveEnabled } from "@/lib/weave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["csv", "jsonl"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const format = params.get("format") ?? "csv";
  if (!FORMATS.has(format)) {
    return NextResponse.json(
      { error: "format must be csv or jsonl" },
      { status: 400 }
    );
  }
  const query = new URLSearchParams({ format });
  for (const key of ["user_id", "from", "to", "limit"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const upstream = await adminFetch(`/api/admin/traces?${query.toString()}`);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `control plane returned ${upstream.status}` },
      { status: 502 }
    );
  }
  const body = await upstream.text();

  if (weaveEnabled() && format === "jsonl") {
    const receipts = body
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((row): row is Record<string, unknown> => row !== null);
    void mirrorReceipts(receipts);
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv" : "application/x-ndjson",
      "Content-Disposition": `attachment; filename="traces.${format}"`,
    },
  });
}
