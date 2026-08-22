import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.AUDIT_URL ?? "https://lan-lu.vercel.app";
const artifactDir = "artifacts/production-audit";
const routes = [
  "/", "/capture", "/sales", "/forecast", "/inventory", "/recommendations",
  "/settings/menu", "/settings/ingredients", "/login", "/onboarding",
];
const expected = {
  "/": ["ภาพรวมร้าน", "ยอดขายวันนี้", "คำแนะนำที่ทำต่อได้"],
  "/capture": ["Quick capture", "เพิ่มยอดขาย", "ยืนยันยอดขาย"],
  "/sales": ["ยอดขายของร้าน", "แนวโน้มจำนวนแก้ว"],
  "/forecast": ["พรุ่งนี้ร้านควรเตรียมอะไร", "ความมั่นใจ"],
  "/inventory": ["สต๊อกที่ต้องรู้", "วัตถุดิบทั้งหมด"],
  "/recommendations": ["สิ่งที่ร้านควรทำต่อ", "Smart recommendations"],
  "/settings/menu": ["เมนูและสูตร", "เพิ่มเมนู"],
  "/settings/ingredients": ["วัตถุดิบและต้นทุน", "เพิ่มวัตถุดิบ"],
  "/login": ["เข้าสู่ LanLu", "ร้านรู้"],
  "/onboarding": ["เริ่มจากร้านของคุณ", "ตั้งค่าร้าน"],
};
mkdirSync(artifactDir, { recursive: true });
const results = [];

async function auditRoute(page, route, viewportName) {
  const consoleErrors = [], pageErrors = [], failedRequests = [], badResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().includes("favicon")) badResponses.push(`${response.status()} ${response.url()}`); });

  const startedAt = Date.now();
  let navigationError = null;
  try {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(900);
    if (!response || response.status() >= 400) navigationError = `HTTP ${response?.status() ?? "no response"}`;
  } catch (error) { navigationError = error.message; }

  const inspection = await page.evaluate((expectedText) => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const interactive = [...document.querySelectorAll("a,button,input,select,textarea")];
    const unnamedInteractive = interactive.filter((element) => {
      const id = element.getAttribute("id");
      const hasAssociatedLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : Boolean(element.closest("label"));
      const labelledBy = element.getAttribute("aria-labelledby");
      return !(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.getAttribute("placeholder") || element.getAttribute("name") || hasAssociatedLabel || (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()));
    }).map((element) => element.outerHTML.slice(0, 180));
    const missingAlt = [...document.querySelectorAll("img")].filter((image) => !image.hasAttribute("alt")).map((image) => image.outerHTML.slice(0, 180));
    const smallTouchTargets = interactive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24); }).map((element) => ({ tag: element.tagName.toLowerCase(), aria: element.getAttribute("aria-label"), text: element.textContent?.trim().slice(0, 30), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const resources = performance.getEntriesByType("resource");
    return {
      title: document.title,
      textLength: document.body.innerText.length,
      linkCount: document.querySelectorAll("a").length,
      buttonCount: document.querySelectorAll("button").length,
      inputCount: document.querySelectorAll("input,select,textarea").length,
      expectedMissing: expectedText.filter((text) => !document.body.innerText.includes(text)),
      unnamedInteractive,
      missingAlt,
      smallTouchTargets,
      viewportWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth > viewportWidth + 1,
      navigation: navigation ? { responseStart: Math.round(navigation.responseStart), domContentLoaded: Math.round(navigation.domContentLoadedEventEnd), loadEventEnd: Math.round(navigation.loadEventEnd), transferSize: navigation.transferSize } : null,
      largestContentfulPaint: performance.getEntriesByType("largest-contentful-paint").at(-1)?.startTime ?? null,
      resourceCount: resources.length,
      resourceTransferSize: resources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
    };
  }, expected[route] ?? []);

  await page.screenshot({ path: `${artifactDir}/${viewportName}-${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}.png`, fullPage: true });
  const issues = [];
  if (navigationError) issues.push(navigationError);
  if (inspection.expectedMissing.length) issues.push(`missing expected text: ${inspection.expectedMissing.join(", ")}`);
  if (inspection.horizontalOverflow) issues.push(`horizontal overflow ${inspection.scrollWidth}px > ${inspection.viewportWidth}px`);
  if (inspection.unnamedInteractive.length) issues.push(`${inspection.unnamedInteractive.length} unnamed interactive elements`);
  if (inspection.missingAlt.length) issues.push(`${inspection.missingAlt.length} images missing alt`);
  if (inspection.smallTouchTargets.length) issues.push(`${inspection.smallTouchTargets.length} interactive targets smaller than 24px`);
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) issues.push(`${pageErrors.length} page errors`);
  if (failedRequests.length) issues.push(`${failedRequests.length} failed requests`);
  if (badResponses.length) issues.push(`${badResponses.length} HTTP responses >= 400`);
  if (inspection.navigation?.domContentLoaded > 5_000) issues.push(`DOMContentLoaded ${inspection.navigation.domContentLoaded}ms > 5000ms budget`);
  const result = { route, viewport: viewportName, durationMs: Date.now() - startedAt, ...inspection, consoleErrors, pageErrors, failedRequests, badResponses, issues, passed: issues.length === 0 };
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${viewportName.padEnd(7)} ${route.padEnd(24)} ${result.durationMs}ms${issues.length ? ` · ${issues.join("; ")}` : ""}`);
}

async function newPage(context, route, viewportName, browser) {
  const page = await context.newPage();
  await auditRoute(page, route, viewportName);
  await page.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "th-TH" });
  for (const route of routes) await newPage(desktop, route, "desktop", browser);
  const mobile = await browser.newContext({ ...devices["iPhone 12"], locale: "th-TH" });
  for (const route of ["/", "/capture", "/inventory", "/recommendations"]) await newPage(mobile, route, "mobile", browser);

  const functional = { captureNavigation: false, captureSubmit: false, mobileMenu: false, keyboardFocus: false, issues: [] };
  try {
    const page = await desktop.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator('a[href="/capture"]').first().click();
    await page.waitForURL("**/capture");
    functional.captureNavigation = true;
    await page.getByRole("button", { name: "เพิ่มจำนวน" }).first().click();
    await page.getByRole("button", { name: "ยืนยันยอดขาย" }).click();
    functional.captureSubmit = await page.locator(".capture-feedback").innerText().then((text) => text.includes("บันทึก"));
    await page.close();
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await mobilePage.getByRole("button", { name: "เปิดเมนู" }).click();
    functional.mobileMenu = await mobilePage.locator(".sidebar.sidebar-open").count() === 1;
    await mobilePage.close();
    const keyboardPage = await desktop.newPage();
    await keyboardPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await keyboardPage.keyboard.press("Tab");
    functional.keyboardFocus = await keyboardPage.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body));
    await keyboardPage.close();
  } catch (error) { functional.issues.push(error.message); }
  functional.passed = functional.captureNavigation && functional.captureSubmit && functional.mobileMenu && functional.keyboardFocus && functional.issues.length === 0;
  console.log(`${functional.passed ? "PASS" : "FAIL"} functional flows · ${JSON.stringify(functional)}`);
  await desktop.close();
  await mobile.close();
  await browser.close();

  const summary = { baseUrl, generatedAt: new Date().toISOString(), routeCount: results.length, passedRoutes: results.filter((result) => result.passed).length, failedRoutes: results.filter((result) => !result.passed).length, functional, results, pass: results.every((result) => result.passed) && functional.passed };
  writeFileSync(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(`SUMMARY ${summary.pass ? "PASS" : "FAIL"} · ${summary.passedRoutes}/${summary.routeCount} route checks passed · artifacts: ${artifactDir}`);
  if (!summary.pass) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
