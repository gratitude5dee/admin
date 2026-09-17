#!/usr/bin/env node
/**
 * Recorded visual walkthrough of the operator dashboard against the mock
 * control plane (test-plan.md T6–T9).
 *
 *   node scripts/visual/record.mjs
 *
 * What it does, in order:
 *   1. starts `node mock-cp.mjs` (MOCK_ADMIN_KEY=test-admin-key) on :4600;
 *   2. runs `npm run build` if .next is missing or older than the sources,
 *      then starts the production server on :3111 with CONTROL_PLANE_URL,
 *      ADMIN_API_KEY=test-admin-key and DASHBOARD_PASSWORD=visual-pass — the
 *      ambient ADMIN_API_KEY (if any) is removed first, the gotcha from
 *      .agents/skills/testing-admin-dashboard/SKILL.md;
 *   3. drives Chromium through Playwright at 1280×800 with video recording:
 *      /login → password → / → /deployments (revoke dev, two-step) → /create
 *      → /tokens?group=stage → /tokens?group=provider → /fleet, asserting
 *      the T6–T9 facts and taking a full-page screenshot after every
 *      navigation;
 *   4. greps the served HTML of every visited page (and .next/static) for the
 *      bearer and fails if it is anywhere;
 *   5. writes <out>/NN-<page>.png, walkthrough.webm, mock.log, manifest.json
 *      and README.md, then stops both servers (only the PIDs it started).
 *
 * Environment (all optional):
 *   PLAYWRIGHT_MODULE  path of the playwright package (default
 *                      /home/user/pwtools/node_modules/playwright)
 *   CHROMIUM           Chromium executable (default /opt/pw-browsers/chromium)
 *   VISUAL_DATE        output folder name under docs/visual (default 2026-09-17)
 *   VISUAL_OUT         full output directory (overrides VISUAL_DATE)
 *
 * No repo dependency is added: Playwright is imported from outside the repo.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOCK_PORT = 4600;
const APP_PORT = 3111;
const BASE = `http://localhost:${APP_PORT}`;
const CP = `http://localhost:${MOCK_PORT}`;
const KEY = "test-admin-key";
const PASSWORD = "visual-pass";
const DATE = process.env.VISUAL_DATE ?? "2026-09-17";
const OUT = process.env.VISUAL_OUT ?? path.join(ROOT, "docs", "visual", DATE);
const PLAYWRIGHT_MODULE =
  process.env.PLAYWRIGHT_MODULE ?? "/home/user/pwtools/node_modules/playwright";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const VIEWPORT = { width: 1280, height: 800 };
const SIZE_LIMIT = 10 * 1024 * 1024;

const log = (...args) => console.log("[visual]", ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Ports and processes
// ---------------------------------------------------------------------------

/** PID of the process listening on `port`, found through /proc (no lsof). */
function listeningPid(port) {
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(table)) continue;
    for (const line of readFileSync(table, "utf8").split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      const [, local, , state, , , , , , inode] = cols;
      if (state === "0A" && local.endsWith(`:${hex}`)) inodes.add(inode);
    }
  }
  if (inodes.size === 0) return null;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let fds = [];
    try {
      fds = readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const target = readlinkSync(`/proc/${entry}/fd/${fd}`);
        const match = target.match(/^socket:\[(\d+)\]$/);
        if (match && inodes.has(match[1])) return Number(entry);
      } catch {
        // fd closed between readdir and readlink
      }
    }
  }
  return null;
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

async function waitForPortFree(port, ms) {
  const deadline = Date.now() + ms;
  while (listeningPid(port) !== null) {
    if (Date.now() > deadline) throw new Error(`port ${port} still in use`);
    await sleep(200);
  }
}

/** Frees :4600 only if the listener is provably `node mock-cp.mjs`. */
async function ensureMockPortFree() {
  const pid = listeningPid(MOCK_PORT);
  if (pid === null) return;
  const argv = cmdline(pid);
  const isMock =
    argv.length >= 2 &&
    /(^|\/)node(js)?$/.test(argv[0]) &&
    argv.some((arg) => arg.endsWith("mock-cp.mjs"));
  if (!isMock) {
    throw new Error(
      `port ${MOCK_PORT} is in use by pid ${pid} (${argv.join(" ") || "unknown"}), which is not node mock-cp.mjs — refusing to kill it`
    );
  }
  log(`killing stale mock pid ${pid} (${argv.join(" ")})`);
  process.kill(pid, "SIGTERM");
  await waitForPortFree(MOCK_PORT, 5000);
}

/** Spawns a child in its own process group and captures its output lines. */
function start(name, command, args, { env, lines, cwd = ROOT }) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const push = (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) lines.push(line);
    }
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("exit", (code, signal) => {
    child.exited = { code, signal };
  });
  log(`${name} pid ${child.pid}`);
  return child;
}

async function stop(name, child) {
  if (!child || child.exited) return;
  const group = -child.pid;
  try {
    process.kill(group, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 5000;
  while (!child.exited && Date.now() < deadline) await sleep(100);
  if (!child.exited) {
    try {
      process.kill(group, "SIGKILL");
    } catch {
      // already gone
    }
  }
  log(`${name} stopped`);
}

async function waitFor(url, { headers = {}, ms = 90_000, child, name }) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (child?.exited) throw new Error(`${name} exited before it answered`);
    try {
      const response = await fetch(url, { headers, redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`${name} did not answer 200 at ${url} in time`);
    await sleep(300);
  }
}

// ---------------------------------------------------------------------------
// Build freshness
// ---------------------------------------------------------------------------

function newestMtime(dir, skip) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip(entry.name, full)) continue;
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full, skip));
    else newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

function buildIfStale() {
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  const skip = (name) => name === "node_modules" || name.endsWith(".test.ts");
  let sources = 0;
  for (const rel of ["app", "components", "lib", "middleware.ts", "next.config.ts", "package.json", "tsconfig.json", "postcss.config.mjs"]) {
    const full = path.join(ROOT, rel);
    if (!existsSync(full)) continue;
    sources = Math.max(
      sources,
      statSync(full).isDirectory() ? newestMtime(full, skip) : statSync(full).mtimeMs
    );
  }
  if (existsSync(buildId) && statSync(buildId).mtimeMs >= sources) {
    log(`.next is current (BUILD_ID ${readFileSync(buildId, "utf8").trim()})`);
    return;
  }
  log(existsSync(buildId) ? ".next is older than the sources — building" : ".next missing — building");
  const result = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error("npm run build failed");
}

// ---------------------------------------------------------------------------
// Assertions and evidence
// ---------------------------------------------------------------------------

const steps = [];
let current = null;
let assertionCount = 0;

function step(name, url) {
  current = { n: steps.length + 1, name, url, screenshot: null, assertions: [] };
  steps.push(current);
  log(`step ${current.n}: ${name}`);
  return current;
}

function check(condition, description) {
  if (!condition) throw new Error(`assertion failed (${current?.name}): ${description}`);
  assertionCount += 1;
  current.assertions.push(description);
  log(`  ok  ${description}`);
}

const screenshots = [];
async function shot(page, slug) {
  const name = `${String(screenshots.length + 1).padStart(2, "0")}-${slug}.png`;
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  screenshots.push(name);
  if (current) current.screenshot = name;
  return name;
}

/** The section whose h2 title contains `title`. */
const section = (page, title) =>
  page.locator("section", { has: page.locator("h2", { hasText: title }) });

/** Value and accent class of the Stat labelled `label` inside `scope`. */
async function stat(scope, label) {
  const value = scope.locator(
    `xpath=.//div[normalize-space(text())=${JSON.stringify(label)}]/following-sibling::div[1]`
  );
  return {
    value: (await value.first().textContent())?.trim() ?? "",
    className: (await value.first().getAttribute("class")) ?? "",
  };
}

/** Whether the first <canvas> inside `scope` has painted (non-transparent) pixels. */
async function canvasPainted(scope) {
  return scope
    .locator("canvas")
    .first()
    .evaluate((canvas) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
      return painted > 200;
    });
}

const secretScan = { pages: [], leaks: [] };
async function assertNoBearer(page, context) {
  const url = page.url();
  const dom = await page.content();
  const served = await (await context.request.get(url)).text();
  secretScan.pages.push(url);
  if (dom.includes(KEY) || served.includes(KEY)) secretScan.leaks.push(url);
  check(!dom.includes(KEY) && !served.includes(KEY), `no bearer in the HTML of ${new URL(url).pathname}${new URL(url).search}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const name of readdirSync(OUT)) {
    if (/\.(png|webm|json|log)$/.test(name) || name === "README.md") rmSync(path.join(OUT, name));
  }

  await ensureMockPortFree();
  if (listeningPid(APP_PORT) !== null) {
    throw new Error(`port ${APP_PORT} is already in use (pid ${listeningPid(APP_PORT)}); stop it first`);
  }

  buildIfStale();
  const buildId = readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim();

  const mockLines = [];
  const nextLines = [];
  const mock = start("mock-cp", "node", ["mock-cp.mjs"], {
    env: { ...process.env, MOCK_ADMIN_KEY: KEY },
    lines: mockLines,
  });

  const serverEnv = { ...process.env };
  delete serverEnv.ADMIN_API_KEY; // the ambient org key must not win over ours
  Object.assign(serverEnv, {
    CONTROL_PLANE_URL: CP,
    ADMIN_API_KEY: KEY,
    DASHBOARD_PASSWORD: PASSWORD,
  });
  const next = start(
    "next start",
    "node",
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT)],
    { env: serverEnv, lines: nextLines }
  );

  let browser = null;
  let failure = null;
  let videoPath = null;
  try {
    await waitFor(`${CP}/api/admin/ops`, { headers: { authorization: `Bearer ${KEY}` }, child: mock, name: "mock-cp", ms: 20_000 });
    await waitFor(`${BASE}/login`, { child: next, name: "next start" });
    log("both servers up");

    // createRequire resolves a package directory (ESM `import()` will not).
    const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: OUT, size: VIEWPORT },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    // 1. /login -------------------------------------------------------------
    step("login page", `${BASE}/login`);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    check(new URL(page.url()).pathname === "/login", "unauthenticated visit lands on /login");
    check(await page.locator('input[name="password"]').isVisible(), "password field is visible");
    await assertNoBearer(page, context);
    await shot(page, "login");

    // 2. submit the password form → / ---------------------------------------
    step("home after login", `${BASE}/`);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/", { waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    check(new URL(page.url()).pathname === "/", "password form redirects to /");
    check(!(await page.evaluate(() => document.cookie)).includes("wzrd_admin_session"), "session cookie is httpOnly (absent from document.cookie)");
    check((await section(page, "Box usage").count()) === 1, "Boxes panel (Box usage) renders");
    check((await section(page, "Box start rate").count()) === 1, "Box start rate panel renders");
    const homeRow = section(page, "Deployments and Create");
    check((await homeRow.count()) === 1, "new stat row 'Deployments and Create' renders");
    const homeDev = await stat(homeRow, "dev releases live");
    const homeProd = await stat(homeRow, "production apps");
    const homeBuilds = await stat(homeRow, "builds (24h)");
    check(/^\d+$/.test(homeDev.value), `dev releases live = ${homeDev.value}`);
    check(/^\d+$/.test(homeProd.value), `production apps = ${homeProd.value}`);
    check(/^\d+$/.test(homeBuilds.value), `builds (24h) = ${homeBuilds.value}`);
    check((await homeRow.locator('a[href^="/deployments"]').count()) === 2, "dev and production stats link to /deployments");
    check((await homeRow.locator('a[href^="/create"]').count()) === 1, "builds stat links to /create");
    await assertNoBearer(page, context);
    await shot(page, "home");

    // 3. /deployments ---------------------------------------------------------
    step("deployments", `${BASE}/deployments`);
    await page.goto(`${BASE}/deployments`, { waitUntil: "networkidle" });
    const platform = section(page, "Platform");
    check((await platform.count()) === 1, "Platform panel renders");
    const cpSha = await stat(platform, "control plane");
    check(/^[0-9a-f]{7}$/.test(cpSha.value), `control plane git sha is short (${cpSha.value})`);
    const dispatcher = await stat(platform, "dispatcher");
    check(dispatcher.value === "healthy" && dispatcher.className.includes("text-emerald-400"), "dispatcher healthy is green");
    const expiring = await stat(platform, "dev expiring (7d)");
    check(expiring.value === "1" && expiring.className.includes("text-orange-400"), "dev expiring (7d) = 1 in orange");
    const prodLiveBefore = await stat(platform, "production live");
    const devLiveBefore = await stat(platform, "dev live");
    check(devLiveBefore.value === "1", "dev live = 1 before revoke");

    const channels = section(page, "Fleet channels");
    const channelNames = await channels.locator("tbody tr td:first-child").allTextContents();
    check(channelNames.map((s) => s.trim()).sort().join(",") === "dev,prod", `both channels render (${channelNames.map((s) => s.trim()).join(", ")})`);
    check((await channels.locator('a[href="/fleet"]').count()) === 1, "manage → /fleet link present");

    const appsPanel = section(page, "App deployments");
    const appRows = appsPanel.locator("tbody tr");
    check((await appRows.count()) === 2, "two app rows render");
    const appNames = await appRows.locator("td:first-child").allTextContents();
    check(appNames[0].includes("alice/tour") && appNames[1].includes("bob/notes"), "rows are alice/tour and bob/notes");
    const orange = appsPanel.locator(".text-orange-400", { hasText: /expires in/ });
    check((await orange.count()) === 1, `orange expiring label: "${(await orange.first().textContent())?.trim()}"`);
    check((await appsPanel.locator(".text-pink-400", { hasText: /^failed/ }).count()) === 1, "bob/notes failed build is pink");
    await assertNoBearer(page, context);
    await shot(page, "deployments");

    // 3b. revoke dev: two-step confirm ---------------------------------------
    step("deployments — inline confirm", `${BASE}/deployments`);
    let dialogs = 0;
    page.on("dialog", (dialog) => {
      dialogs += 1;
      dialog.dismiss();
    });
    const revoke = appsPanel.getByRole("button", { name: "revoke dev" }).first();
    check(await revoke.isEnabled(), "first 'revoke dev' button (alice/tour) is enabled");
    await revoke.click();
    const confirm = appsPanel.getByRole("button", { name: "confirm" });
    await confirm.waitFor({ state: "visible", timeout: 5000 });
    check((await confirm.count()) === 1, "inline confirm button appears");
    check((await appsPanel.getByText("revoke dev alice-tour?").count()) === 1, "confirm prompt names the app (revoke dev alice-tour?)");
    check((await appsPanel.getByRole("button", { name: "cancel" }).count()) === 1, "cancel button appears");
    check(new URL(page.url()).pathname === "/deployments", "first click does not navigate");
    check(dialogs === 0, "no native confirm() dialog");
    // The filter form is method=get; the inline confirm is the panel's only POST form.
    const confirmForm = appsPanel.locator('form[method="post"]');
    check((await confirmForm.count()) === 1, "confirm is a plain POST form (the panel's only one)");
    check((await confirmForm.getByRole("button", { name: "confirm" }).count()) === 1, "the POST form holds the confirm button");
    check((await confirmForm.getAttribute("action")) === "/api/deployments/apps/alice-tour/dev", "form posts to /api/deployments/apps/alice-tour/dev");
    check((await confirmForm.locator('input[name="action"]').getAttribute("value")) === "revoke", "hidden action=revoke");
    await assertNoBearer(page, context);
    await shot(page, "deployments-confirm");

    // 3c. confirm → POST → 303 → re-render from the mock's state -------------
    step("deployments after revoke", `${BASE}/deployments`);
    const postSeen = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/deployments/apps/alice-tour/dev",
      { timeout: 10_000 }
    );
    const backOnPage = page.waitForResponse(
      (response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/deployments" && response.status() === 200,
      { timeout: 15_000 }
    );
    await confirm.click();
    const post = await postSeen;
    const postResponse = await post.response();
    check(postResponse?.status() === 303, `same-origin POST answered 303 (${postResponse?.status()})`);
    await backOnPage;
    await page.waitForLoadState("networkidle");
    check(new URL(page.url()).pathname === "/deployments" && !new URL(page.url()).search.includes("error"), "redirected back to /deployments with no ?error=");
    await sleep(200);
    const mockPost = mockLines.find((line) => line.startsWith("POST /api/admin/create/apps/alice-tour/dev"));
    check(mockPost !== undefined && mockPost.includes("auth_valid=true"), `mock logged the bearer POST: "${mockPost}"`);
    check(mockLines.some((line) => line.includes('{"action":"revoke"}')), 'mock received body {"action":"revoke"}');
    check(mockLines.some((line) => line.includes("create app alice-tour revoke -> dev=—")), "mock state: alice-tour dev=—");
    const aliceDev = await section(page, "App deployments").locator("tbody tr").first().locator("td").nth(4).textContent();
    check(aliceDev?.trim() === "—", `alice/tour dev cell re-renders as "—"`);
    const devLiveAfter = await stat(section(page, "Platform"), "dev live");
    const expiringAfter = await stat(section(page, "Platform"), "dev expiring (7d)");
    check(devLiveAfter.value === "0", "dev live = 0 after revoke");
    check(expiringAfter.value === "0" && !expiringAfter.className.includes("text-orange-400"), "dev expiring (7d) = 0 and no longer orange");
    check(!(await section(page, "App deployments").getByRole("button", { name: "revoke dev" }).first().isEnabled()), "revoke dev is disabled once there is no dev release");
    await assertNoBearer(page, context);
    await shot(page, "deployments-revoked");

    // 4. /create --------------------------------------------------------------
    step("create", `${BASE}/create`);
    await page.goto(`${BASE}/create`, { waitUntil: "networkidle" });
    const funnel = section(page, "Intake funnel");
    check((await funnel.count()) === 1, "Intake funnel panel renders");
    check(await canvasPainted(funnel), "funnel bar chart canvas has painted bars");
    const failed = await stat(funnel, "failed");
    check(failed.value === "1" && failed.className.includes("text-pink-400"), "failed stat = 1 in pink");
    const production = await stat(funnel, "production");
    check(production.value === prodLiveBefore.value, `funnel production (${production.value}) equals /deployments production live (${prodLiveBefore.value})`);
    const rules = await section(page, "Builds").locator("tbody tr td:nth-child(2)").allTextContents();
    const counts = rules.map(Number);
    check(counts.length >= 2 && counts.every((v, i) => i === 0 || counts[i - 1] >= v), `by_rule sorted desc (${counts.join(" ≥ ")})`);
    for (const title of ["Quality", "Progress relay and mirror", "Templates", "Budget"]) {
      check((await section(page, title).count()) === 1, `${title} panel renders`);
    }
    check((await section(page, "Budget").locator('a[href="/tokens?group=project"]').count()) === 1, "budget links to /tokens?group=project");
    check((await page.getByText("Failed to load").count()) === 0, "no LoadError on /create");
    await assertNoBearer(page, context);
    await shot(page, "create");

    // 5. /tokens?group=stage ----------------------------------------------------
    step("tokens by stage", `${BASE}/tokens?group=stage`);
    await page.goto(`${BASE}/tokens?group=stage`, { waitUntil: "networkidle" });
    const tabs = page.locator('nav[aria-label="group by"] a');
    const tabText = (await tabs.allTextContents()).map((s) => s.trim());
    check(["user", "model", "provider", "tier", "lane", "stage", "project"].every((t) => tabText.includes(t)), `group tabs: ${tabText.join(" · ")}`);
    const byStage = section(page, "Token usage by stage");
    check((await byStage.count()) === 1, "Token usage by stage panel renders");
    check(await canvasPainted(byStage), "stage bar chart canvas has painted bars");
    const estimated = byStage.locator("td span[title]", { hasText: /^~\$/ });
    check((await estimated.count()) >= 1, `'~' estimated cost cell present (${(await estimated.first().textContent())?.trim()}, title "${await estimated.first().getAttribute("title")}")`);
    check((await byStage.getByText("reconciles with the totals above (A6)").count()) === 1, "grouped sum reconciles with totals (A6)");
    const astra = section(page, "Astra vs GLM");
    check((await astra.count()) === 1, "Astra vs GLM card renders");
    const astraText = (await astra.textContent()) ?? "";
    check(astraText.includes("Astra") && astraText.includes("GLM-5.3-Flash"), "card compares Astra with GLM-5.3-Flash");
    check((await astra.locator("tbody tr").count()) === 2, "card has plan and build + review rows");
    const stageProduction = await stat(astra, "production apps");
    check(stageProduction.value === production.value, `card production apps (${stageProduction.value}) equals the Create funnel`);
    await assertNoBearer(page, context);
    await shot(page, "tokens-stage");

    // 6. /tokens?group=provider -------------------------------------------------
    step("tokens by provider", `${BASE}/tokens?group=provider`);
    await page.goto(`${BASE}/tokens?group=provider`, { waitUntil: "networkidle" });
    const byProvider = section(page, "Token usage by provider");
    check((await byProvider.count()) === 1, "Token usage by provider panel renders");
    const providerHeader = await byProvider.locator("thead th").first().textContent();
    check(providerHeader?.trim() === "provider", "table is keyed by provider");
    check((await byProvider.locator("tbody tr").count()) >= 2, "at least two providers");
    check((await byProvider.getByText("reconciles with the totals above (A6)").count()) === 1, "grouped sum reconciles with totals (A6)");
    check((await section(page, "Astra vs GLM").count()) === 0, "no Astra vs GLM card outside the stage tab");
    await assertNoBearer(page, context);
    await shot(page, "tokens-provider");

    // 7. /fleet (unchanged) -----------------------------------------------------
    step("fleet", `${BASE}/fleet`);
    await page.goto(`${BASE}/fleet`, { waitUntil: "networkidle" });
    for (const title of ["Fleet sync", "Box drift", "Latest sync job", "Releases"]) {
      check((await section(page, title).count()) === 1, `${title} panel renders`);
    }
    check((await page.getByText("Failed to load").count()) === 0, "no LoadError on /fleet");
    await assertNoBearer(page, context);
    await shot(page, "fleet");

    // T9 reconcile ----------------------------------------------------------------
    step("reconcile (T9)", null);
    check(
      homeProd.value === prodLiveBefore.value && prodLiveBefore.value === production.value && production.value === stageProduction.value,
      `home production apps (${homeProd.value}) = /deployments production live (${prodLiveBefore.value}) = /create funnel production (${production.value}) = /tokens stage card (${stageProduction.value})`
    );
    check(homeDev.value === devLiveBefore.value, `home dev releases live (${homeDev.value}) = /deployments dev live before revoke (${devLiveBefore.value})`);

    // Secret scan of the build output ------------------------------------------
    step("secret scan", null);
    const staticDir = path.join(ROOT, ".next", "static");
    const leaky = [];
    const scan = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (readFileSync(full).includes(KEY)) leaky.push(path.relative(ROOT, full));
      }
    };
    scan(staticDir);
    check(leaky.length === 0, `no bearer in .next/static (${leaky.join(", ") || "clean"})`);
    check(secretScan.leaks.length === 0, `no bearer in ${secretScan.pages.length} served pages`);
    const hardErrors = consoleErrors.filter((text) => !/favicon|status of 404/.test(text));
    check(hardErrors.length === 0, `no browser console errors (${hardErrors.join(" | ") || "none"})`);

    // Close the context so the video lands ---------------------------------------
    const video = page.video();
    await context.close();
    videoPath = video ? await video.path() : null;
  } catch (error) {
    failure = error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stop("next start", next);
    await stop("mock-cp", mock);
  }

  // Artifacts -------------------------------------------------------------------
  const mockPosts = mockLines.filter((line) => line.startsWith("POST ") || line.startsWith("  body ") || line.startsWith("  create app "));
  writeFileSync(path.join(OUT, "mock.log"), mockLines.join("\n") + "\n");
  if (videoPath && existsSync(videoPath)) {
    renameSync(videoPath, path.join(OUT, "walkthrough.webm"));
  }
  const files = readdirSync(OUT).filter((name) => name !== "manifest.json" && name !== "README.md");
  const sizeBytes = files.reduce((sum, name) => sum + statSync(path.join(OUT, name)).size, 0);
  const manifest = {
    date: DATE,
    generated_at: new Date().toISOString(),
    base_url: BASE,
    control_plane: CP,
    build_id: buildId,
    viewport: VIEWPORT,
    status: failure ? "failed" : "passed",
    failure: failure ? String(failure.message ?? failure) : null,
    steps,
    assertions: assertionCount,
    video: existsSync(path.join(OUT, "walkthrough.webm")) ? "walkthrough.webm" : null,
    screenshots,
    mock_log: "mock.log",
    mock_posts: mockPosts,
    secret_scan: { pages: secretScan.pages, leaks: secretScan.leaks, static_scanned: true },
    size_bytes: sizeBytes,
  };
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(path.join(OUT, "README.md"), readme(manifest));
  log(`wrote ${OUT} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB, ${assertionCount} assertions)`);

  if (failure) {
    console.error("[visual] FAILED:", failure.stack ?? failure);
    console.error("[visual] last next.log lines:\n" + nextLines.slice(-20).join("\n"));
    process.exitCode = 1;
    return;
  }
  if (sizeBytes > SIZE_LIMIT) {
    console.error(`[visual] output is ${sizeBytes} bytes, over the 10 MB limit`);
    process.exitCode = 1;
  }
}

function readme(manifest) {
  const stepLines = manifest.steps
    .map((s) => `| ${s.n} | ${s.name} | ${s.url ? `\`${new URL(s.url).pathname}${new URL(s.url).search}\`` : "—"} | ${s.screenshot ? `[${s.screenshot}](./${s.screenshot})` : "—"} | ${s.assertions.length} |`)
    .join("\n");
  return `# Visual walkthrough — ${manifest.date}

Recorded run of the operator dashboard (production build \`${manifest.build_id}\`, \`next start\` on :3111) against the mock control plane (\`mock-cp.mjs\` on :4600), driven by Playwright/Chromium at ${manifest.viewport.width}×${manifest.viewport.height}. Status: **${manifest.status}**${manifest.failure ? ` — ${manifest.failure}` : ""}. ${manifest.assertions} assertions.

## What it proves

- **T6 Deployments** — Platform stats (short git SHA, green Dispatcher, orange \`dev expiring (7d)\`), both fleet channels, both app rows with the orange \`expires in …\` label and the pink failed build; \`revoke dev\` opens an inline confirm (no navigation, no native dialog) whose form is a plain same-origin POST; confirming yields a 303 back to \`/deployments\`, the mock logs \`POST /api/admin/create/apps/alice-tour/dev auth_valid=true\` with \`{"action":"revoke"}\` (see [mock.log](./mock.log)), and the row re-renders \`dev —\` from the control plane's state.
- **T7 Create** — the funnel canvas is painted, \`failed\` is pink, \`by_rule\` is sorted descending, all six panels render with no LoadError (the 500 → six "Failed to load" case is pinned by \`app/(dashboard)/create/page.test.ts\`).
- **T8 Tokens groups** — the tab strip, the stage and provider grouped views, the Astra vs GLM card, a \`~\` list-estimated cost cell with its tooltip, and the A6 reconciliation line on each grouped tab.
- **T9 Reconcile** — home \`production apps\` = \`/deployments\` \`production live\` = \`/create\` funnel \`production\` = the stage card's \`production apps\`.
- **Secret leak** — the bearer (\`test-admin-key\`) appears in none of the ${manifest.secret_scan.pages.length} served pages nor anywhere under \`.next/static\`; the session cookie is absent from \`document.cookie\`.

## Steps

| # | step | url | screenshot | assertions |
| --- | --- | --- | --- | --- |
${stepLines}

Video: ${manifest.video ? `[${manifest.video}](./${manifest.video})` : "not recorded"}. Machine-readable summary: [manifest.json](./manifest.json).

## Re-run

\`\`\`sh
node scripts/visual/record.mjs
\`\`\`

Needs Playwright at \`PLAYWRIGHT_MODULE\` (default \`/home/user/pwtools/node_modules/playwright\`) and a Chromium at \`CHROMIUM\` (default \`/opt/pw-browsers/chromium\`); no repo dependency is added. The script rebuilds \`.next\` when it is older than the sources, starts and stops both servers itself (only the PIDs it started), and overwrites this directory. Set \`VISUAL_DATE\` to write a new dated folder.
`;
}

main().catch((error) => {
  console.error("[visual] fatal:", error);
  process.exitCode = 1;
});
