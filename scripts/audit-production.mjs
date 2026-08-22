import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.AUDIT_URL ?? "https://lan-lu.vercel.app";
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
const hasCredentials = Boolean(email && password);
const artifactDir = "artifacts/production-audit";
const protectedRoutes = ["/", "/capture", "/sales", "/forecast", "/inventory", "/recommendations", "/settings/menu", "/settings/ingredients", "/onboarding"];
const auditRoutes = ["/login", "/auth/reset-password", ...protectedRoutes];
mkdirSync(artifactDir, { recursive: true });
const results = [];

async function inspect(page, route, viewportName, authenticated) {
  const consoleErrors = [], pageErrors = [], failedRequests = [], badResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().includes("favicon")) badResponses.push(`${response.status()} ${response.url()}`); });
  let navigationError = null;
  try {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(700);
    if (!response || response.status() >= 400) navigationError = `HTTP ${response?.status() ?? "no response"}`;
  } catch (error) { navigationError = error.message; }

  let inspection;
  try {
    inspection = await page.evaluate(({ route, authenticated }) => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const interactive = [...document.querySelectorAll("a,button,input,select,textarea")];
    const unnamedInteractive = interactive.filter((element) => {
      const id = element.getAttribute("id");
      const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : Boolean(element.closest("label"));
      const labelledBy = element.getAttribute("aria-labelledby");
      return !(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.getAttribute("placeholder") || hasLabel || (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()));
    }).map((element) => element.outerHTML.slice(0, 180));
    const visibleInteractive = interactive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
    const smallTouchTargets = visibleInteractive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map((element) => ({ tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 30), aria: element.getAttribute("aria-label"), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const viewportHeight = window.innerHeight;
    const scrollHeight = document.documentElement.scrollHeight;
    const expectedLogin = !authenticated && route !== "/login";
    const onLogin = location.pathname === "/login";
    return { finalPath: location.pathname, expectedLogin, onLogin, title: document.title, textLength: document.body.innerText.length, expectedMissing: route === "/login" && !onLogin ? ["login redirect"] : [], unnamedInteractive, smallTouchTargets, viewportWidth, viewportHeight, scrollWidth, scrollHeight, horizontalOverflow: scrollWidth > viewportWidth + 1, verticalOverflow: scrollHeight > viewportHeight + 1, navigation: navigation ? { domContentLoaded: Math.round(navigation.domContentLoadedEventEnd), loadEventEnd: Math.round(navigation.loadEventEnd), transferSize: navigation.transferSize } : null };
    }, { route, authenticated });
  } catch {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    inspection = await page.evaluate(({ route, authenticated }) => { const viewportWidth = document.documentElement.clientWidth; const viewportHeight = window.innerHeight; const scrollWidth = document.documentElement.scrollWidth; const scrollHeight = document.documentElement.scrollHeight; return { finalPath: location.pathname, expectedLogin: !authenticated && route !== "/login", onLogin: location.pathname === "/login", title: document.title, textLength: document.body.innerText.length, expectedMissing: [], unnamedInteractive: [], smallTouchTargets: [], viewportWidth, viewportHeight, scrollWidth, scrollHeight, horizontalOverflow: scrollWidth > viewportWidth + 1, verticalOverflow: scrollHeight > viewportHeight + 1, navigation: null }; }, { route, authenticated });
  }
  await page.screenshot({ path: `${artifactDir}/${authenticated ? "auth-" : "public-"}${viewportName}-${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}.png`, fullPage: true });
  const issues = [];
  if (navigationError) issues.push(navigationError);
  if (inspection.expectedMissing.length) issues.push(inspection.expectedMissing.join(", "));
  if (inspection.horizontalOverflow) issues.push(`horizontal overflow ${inspection.scrollWidth}px > ${inspection.viewportWidth}px`);
  if (inspection.unnamedInteractive.length) issues.push(`${inspection.unnamedInteractive.length} unnamed interactive elements`);
  if (inspection.smallTouchTargets.length) issues.push(`${inspection.smallTouchTargets.length} visible targets <44px`);
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) issues.push(`${pageErrors.length} page errors`);
  if (failedRequests.length) issues.push(`${failedRequests.length} failed requests`);
  if (badResponses.length) issues.push(`${badResponses.length} HTTP responses >=400`);
  if (inspection.navigation?.domContentLoaded > 5000) issues.push(`DOMContentLoaded ${inspection.navigation.domContentLoaded}ms > 5000ms`);
  const result = { route, viewport: viewportName, authenticated, ...inspection, consoleErrors, pageErrors, failedRequests, badResponses, issues, passed: issues.length === 0 };
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${authenticated ? "auth" : "guest"}/${viewportName} ${route}${issues.length ? ` · ${issues.join("; ")}` : ""}`);
}

async function authenticate(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /เข้าสู่ Dashboard|เข้าสู่ระบบ/ }).click();
  await page.waitForTimeout(1200);
  const ok = new URL(page.url()).pathname !== "/login";
  await page.close();
  return ok;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "th-TH" });
  const authReady = hasCredentials && await authenticate(desktop);
  for (const route of auditRoutes) { const page = await desktop.newPage(); await inspect(page, route, "desktop", authReady); await page.close(); }
  const mobile = await browser.newContext({ ...devices["iPhone 12"], locale: "th-TH" });
  if (authReady && hasCredentials) await authenticate(mobile);
  for (const route of (authReady ? auditRoutes : ["/login", "/", "/capture", "/inventory", "/recommendations"])) { const page = await mobile.newPage(); await inspect(page, route, "mobile", authReady); await page.close(); }

  const accessPage = await browser.newPage();
  await accessPage.goto(`${baseUrl}/capture`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const accessControl = !authReady ? new URL(accessPage.url()).pathname === "/login" : true;
  await accessPage.close();
  const summary = { baseUrl, generatedAt: new Date().toISOString(), hasCredentials, authReady, routeCount: results.length, passedRoutes: results.filter((result) => result.passed).length, failedRoutes: results.filter((result) => !result.passed).length, accessControl, results, pass: accessControl && results.every((result) => result.passed) };
  writeFileSync(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(`SUMMARY ${summary.pass ? "PASS" : "FAIL"} · ${summary.passedRoutes}/${summary.routeCount} checks · auth=${authReady ? "ready" : "not configured"}`);
  await desktop.close(); await mobile.close(); await browser.close();
  if (!summary.pass) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
