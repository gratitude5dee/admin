/**
 * Cut an immutable template release through the authenticated operator UI.
 * The dashboard's server-side ADMIN_API_KEY proxies the artifact to the
 * control plane; neither the key nor the base64 payload reaches client code.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSend, ControlPlaneError } from "@/lib/controlPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const MAX_ARTIFACT_BYTES = 3 * 1024 * 1024;
const MAX_NOTES_LENGTH = 1_000;

function back(
  request: NextRequest,
  result: { error?: string; released?: string }
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/fleet";
  url.search = "";
  if (result.error) url.searchParams.set("error", result.error);
  if (result.released) url.searchParams.set("released", result.released);
  return NextResponse.redirect(url, 303);
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function artifactField(form: FormData): File | null {
  const value = form.get("artifact");
  return value instanceof File ? value : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  if (!form) return back(request, { error: "invalid release form" });

  const version = textField(form, "version");
  const gitSha = textField(form, "git_sha");
  const hermesRef = textField(form, "hermes_ref");
  const notes = textField(form, "notes");
  const artifact = artifactField(form);

  if (!VERSION_PATTERN.test(version)) {
    return back(request, { error: "invalid version" });
  }
  if (!SHA_PATTERN.test(gitSha)) {
    return back(request, { error: "invalid git sha" });
  }
  if (hermesRef && !SHA_PATTERN.test(hermesRef)) {
    return back(request, { error: "invalid Hermes ref" });
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return back(request, { error: "notes must be 1000 characters or fewer" });
  }
  if (
    !artifact ||
    artifact.size === 0 ||
    artifact.size > MAX_ARTIFACT_BYTES ||
    !artifact.name.endsWith(".tgz")
  ) {
    return back(request, {
      error: "artifact must be a non-empty .tgz no larger than 3 MiB",
    });
  }

  try {
    const artifactBase64 = Buffer.from(await artifact.arrayBuffer()).toString(
      "base64"
    );
    await adminSend("/api/admin/fleet/releases", "POST", {
      version,
      git_sha: gitSha,
      ...(hermesRef ? { hermes_ref: hermesRef } : {}),
      ...(notes ? { notes } : {}),
      artifact_base64: artifactBase64,
    });
    return back(request, { released: version });
  } catch (error) {
    const message =
      error instanceof ControlPlaneError || error instanceof Error
        ? error.message
        : "control plane unreachable";
    return back(request, { error: message });
  }
}
