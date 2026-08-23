import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.AUDIT_URL ?? "https://lan-lu.vercel.app";
const maxDomContentLoaded = Number(process.env.AUDIT_MAX_DOM_MS ?? "15000");
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
const hasCredentials = Boolean(email && password);
const artifactDir = "artifacts/production-audit";
const protectedRoutes = ["/", "/capture", "/sales", "/forecast", "/inventory", "/recommendations", "/settings/menu", "/settings/ingredients", "/assistant", "/onboarding"];
const auditRoutes = ["/login", "/auth/reset-password", ...protectedRoutes];
const publicRoutes = ["/login", "/auth/reset-password", "/", "/capture", "/inventory", "/recommendations"];
const viewports = [
  { name: "desktop", options: { viewport: { width: 1440, height: 1000 }, locale: "th-TH" }, mobile: false },
  { name: "desktop-compact", options: { viewport: { width: 1024, height: 900 }, locale: "th-TH" }, mobile: false },
  { name: "mobile", options: { ...devices["iPhone 12"], locale: "th-TH" }, mobile: true },
  { name: "mobile-wide", options: { viewport: { width: 430, height: 932 }, locale: "th-TH" }, mobile: true },
];

mkdirSync(artifactDir, { recursive: true });
const results = [];
const interactionResults = [];
const authenticationResults = [];

function safeRouteName(route) {
  return route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
}

function expectedNavHref(pathname) {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/settings/ingredients")) return null;
  return ["/capture", "/sales", "/forecast", "/inventory", "/recommendations", "/settings/menu", "/assistant"].find((href) => pathname.startsWith(href)) ?? null;
}

async function inspect(page, route, viewportName, mobile, authenticated) {
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
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight;
      };
      const interactive = [...document.querySelectorAll("a,button,input,select,textarea")];
      const visibleInteractive = interactive.filter(isVisible);
      const unnamedInteractive = visibleInteractive.filter((element) => {
        const id = element.getAttribute("id");
        const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : Boolean(element.closest("label"));
        const labelledBy = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean).some((value) => document.getElementById(value)?.textContent?.trim());
        return !(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.getAttribute("placeholder") || hasLabel || labelledBy);
      }).map((element) => element.outerHTML.slice(0, 180));
      const smallTouchTargets = visibleInteractive.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).map((element) => ({ tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 30), aria: element.getAttribute("aria-label"), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height), className: element.className }));
      const invalidLinks = [...document.querySelectorAll("a")].map((element) => element.getAttribute("href") ?? "").filter((href) => !href || href === "#" || href.startsWith("javascript:"));
      const h1 = document.querySelector("h1");
      const activeNav = document.querySelector(".nav-item[aria-current=\"page\"],.capture-nav[aria-current=\"page\"]");
      const expectedActive = route !== "/login" && route !== "/auth/reset-password" && route !== "/onboarding" && authenticated ? activeNav?.getAttribute("href") ?? null : null;
      return {
        finalPath: location.pathname,
        title: document.title,
        h1Text: h1?.textContent?.trim() ?? "",
        hasMain: Boolean(document.querySelector("main,.main-content")),
        hasPrimaryAction: [...document.querySelectorAll(".button-primary,button[type=submit]")].some(isVisible),
        activeNavHref: activeNav?.getAttribute("href") ?? null,
        expectedActiveNav: expectedActive,
        invalidLinks,
        textLength: document.body.innerText.length,
        unnamedInteractive,
        smallTouchTargets,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        verticalOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
        navigation: (() => { const entry = performance.getEntriesByType("navigation")[0]; return entry ? { domContentLoaded: Math.round(entry.domContentLoadedEventEnd), loadEventEnd: Math.round(entry.loadEventEnd), transferSize: entry.transferSize } : null; })(),
      };
    }, { route, authenticated });
  } catch {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    inspection = await page.evaluate(() => ({ finalPath: location.pathname, title: document.title, h1Text: document.querySelector("h1")?.textContent?.trim() ?? "", hasMain: Boolean(document.querySelector("main,.main-content")), hasPrimaryAction: false, activeNavHref: null, expectedActiveNav: null, invalidLinks: [], textLength: document.body.innerText.length, unnamedInteractive: [], smallTouchTargets: [], viewportWidth: document.documentElement.clientWidth, viewportHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, horizontalOverflow: false, verticalOverflow: false, navigation: null }));
  }

  await page.screenshot({ path: `${artifactDir}/${authenticated ? "auth" : "guest"}-${viewportName}-${safeRouteName(route)}.png`, fullPage: true }).catch(() => {});
  const issues = [];
  if (navigationError) issues.push(navigationError);
  if (!authenticated && protectedRoutes.includes(route) && inspection.finalPath !== "/login") issues.push(`protected route did not redirect to /login (final ${inspection.finalPath})`);
  if (authenticated && protectedRoutes.includes(route) && route !== "/onboarding" && inspection.finalPath === "/login") issues.push("authenticated route redirected to /login");
  if (route !== "/auth/reset-password" && route !== "/onboarding" && !inspection.h1Text) issues.push("missing meaningful h1");
  if (!inspection.hasMain) issues.push("missing main landmark");
  if (authenticated && route !== "/login" && route !== "/auth/reset-password" && route !== "/onboarding" && expectedNavHref(inspection.finalPath) && inspection.activeNavHref !== expectedNavHref(inspection.finalPath)) issues.push(`active navigation mismatch: expected ${expectedNavHref(inspection.finalPath) ?? "none"}, got ${inspection.activeNavHref ?? "none"}`);
  if (inspection.invalidLinks.length) issues.push(`${inspection.invalidLinks.length} invalid links`);
  if (inspection.horizontalOverflow) issues.push(`horizontal overflow ${inspection.scrollWidth}px > ${inspection.viewportWidth}px`);
  if (inspection.unnamedInteractive.length) issues.push(`${inspection.unnamedInteractive.length} unnamed interactive elements`);
  if (mobile && inspection.smallTouchTargets.length) issues.push(`${inspection.smallTouchTargets.length} visible targets <44px`);
  if (inspection.textLength < 60) issues.push("page content appears empty");
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) issues.push(`${pageErrors.length} page errors`);
  if (failedRequests.length) issues.push(`${failedRequests.length} failed requests`);
  if (badResponses.length) issues.push(`${badResponses.length} HTTP responses >=400`);
  if (inspection.navigation?.domContentLoaded > maxDomContentLoaded) issues.push(`DOMContentLoaded ${inspection.navigation.domContentLoaded}ms > ${maxDomContentLoaded}ms`);
  const result = { route, viewport: viewportName, authenticated, ...inspection, consoleErrors, pageErrors, failedRequests, badResponses, issues, passed: issues.length === 0 };
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${authenticated ? "auth" : "guest"}/${viewportName} ${route}${issues.length ? ` · ${issues.join("; ")}` : ""}`);
}

async function authenticate(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /เข้าสู่ Dashboard|เข้าสู่ระบบ/ }).first().click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    return new URL(page.url()).pathname !== "/login";
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function auditGuestInteractions(context) {
  const page = await context.newPage();
  const issues = [];
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /ลืม password/ }).click();
    await page.waitForTimeout(500);
    if (!(await page.getByRole("alert").count())) issues.push("login forgot-password validation missing");
    await page.locator(".auth-footer button").click();
    await page.waitForTimeout(500);
    if (!(await page.getByRole("heading", { name: "สร้างบัญชีเจ้าของร้าน" }).count())) issues.push("signup toggle did not change heading");
    await page.goto(`${baseUrl}/auth/reset-password`, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!(await page.getByLabel("Password ใหม่").count()) || !(await page.getByLabel("ยืนยัน password").count())) issues.push("reset password fields missing");
  } catch (error) {
    issues.push(error.message);
  } finally {
    await page.close();
  }
  const result = { kind: "guest-interactions", issues, passed: issues.length === 0 };
  interactionResults.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} guest/interactions${issues.length ? ` · ${issues.join("; ")}` : ""}`);
  return result;
}

async function auditAuthenticatedInteractions(context, viewportName, mobile) {
  const page = await context.newPage();
  const issues = [];
  try {
    await page.goto(`${baseUrl}/capture`, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (const tab of ["เพิ่มยอดขาย", "รับวัตถุดิบ", "แจ้งของเสีย", "ปรับยอดสต๊อก"]) {
      const tabButton = page.getByRole("tab", { name: tab });
      if (!(await tabButton.count())) { issues.push(`missing Capture tab ${tab}`); continue; }
      await tabButton.click();
      const selected = await tabButton.getAttribute("aria-selected");
      const panelId = await tabButton.getAttribute("aria-controls");
      if (selected !== "true" || !panelId || !(await page.locator(`#${panelId}`).isVisible())) issues.push(`Capture tab contract failed for ${tab}`);
    }
    const stepperPlus = page.locator("button[aria-label*='เพิ่มจำนวน']").first();
    if (await stepperPlus.count()) {
      await stepperPlus.click();
      const stepperMinus = page.locator("button[aria-label*='ลดจำนวน']").first();
      if (await stepperMinus.count()) await stepperMinus.click();
    }
    const calendar = page.getByRole("button", { name: "เปิดปฏิทิน" }).first();
    if (await calendar.count()) {
      await calendar.click();
      if (!(await page.getByRole("dialog", { name: "เลือกวันที่" }).isVisible())) issues.push("date picker did not open");
      await page.keyboard.press("Escape");
      if (await page.evaluate(() => document.activeElement?.id !== "business-date-calendar")) issues.push("date picker did not restore focus");
    }
    await page.goto(`${baseUrl}/assistant`, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (const tab of ["ผู้ช่วย Gemini", "นำเข้า CSV"]) {
      const tabButton = page.getByRole("tab", { name: tab });
      if (!(await tabButton.count())) { issues.push(`missing Assistant tab ${tab}`); continue; }
      await tabButton.click();
      if ((await tabButton.getAttribute("aria-selected")) !== "true") issues.push(`Assistant tab did not select ${tab}`);
    }
    if (mobile) {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const menuButton = page.getByRole("button", { name: "เปิดเมนู" });
      await menuButton.click();
      if (!(await page.locator(".sidebar.sidebar-open").count())) issues.push("mobile drawer did not open");
      await page.keyboard.press("Escape");
      if (await page.locator(".sidebar.sidebar-open").count()) issues.push("Escape did not close mobile drawer");
      if (await page.evaluate(() => document.activeElement?.classList.contains("mobile-menu-button") !== true)) issues.push("mobile drawer did not restore focus");
    }
  } catch (error) {
    issues.push(error.message);
  } finally {
    await page.close();
  }
  const result = { kind: "authenticated-interactions", viewport: viewportName, issues, passed: issues.length === 0 };
  interactionResults.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} auth/${viewportName}/interactions${issues.length ? ` · ${issues.join("; ")}` : ""}`);
  return result;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  let guestInteractionDone = false;
  for (const viewport of viewports) {
    const context = await browser.newContext(viewport.options);
    const authReady = hasCredentials && await authenticate(context);
    authenticationResults.push({ viewport: viewport.name, authReady });
    for (const route of (authReady ? auditRoutes : publicRoutes)) {
      const page = await context.newPage();
      await inspect(page, route, viewport.name, viewport.mobile, authReady);
      await page.close();
    }
    if (authReady) {
      await auditAuthenticatedInteractions(context, viewport.name, viewport.mobile);
    } else if (!guestInteractionDone && viewport.name === "desktop") {
      await auditGuestInteractions(context);
      guestInteractionDone = true;
    }
    await context.close();
  }

  const accessPage = await browser.newPage();
  let accessControl = false;
  try {
    await accessPage.goto(`${baseUrl}/capture`, { waitUntil: "domcontentloaded", timeout: 60000 });
    accessControl = hasCredentials ? authenticationResults.some((item) => item.authReady) : new URL(accessPage.url()).pathname === "/login";
  } catch { accessControl = false; }
  await accessPage.close();
  const summary = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    hasCredentials,
    authenticationResults,
    routeCount: results.length,
    passedRoutes: results.filter((result) => result.passed).length,
    failedRoutes: results.filter((result) => !result.passed).length,
    interactionCount: interactionResults.length,
    passedInteractions: interactionResults.filter((result) => result.passed).length,
    failedInteractions: interactionResults.filter((result) => !result.passed).length,
    accessControl,
    results,
    interactionResults,
    pass: accessControl && results.every((result) => result.passed) && interactionResults.every((result) => result.passed),
  };
  writeFileSync(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(`SUMMARY ${summary.pass ? "PASS" : "FAIL"} · routes=${summary.passedRoutes}/${summary.routeCount} interactions=${summary.passedInteractions}/${summary.interactionCount} auth=${hasCredentials ? "configured" : "not configured"}`);
  await browser.close();
  if (!summary.pass) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
