import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.AUDIT_URL ?? "https://lan-lu.vercel.app";
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
const tabs = ["เพิ่มยอดขาย", "รับวัตถุดิบ", "แจ้งของเสีย", "ปรับยอดสต๊อก"];
const artifactDir = "artifacts/capture-audit";
mkdirSync(artifactDir, { recursive: true });
const results = [];

async function authenticate(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /เข้าสู่/ }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15000 }).catch(() => {});
  return new URL(page.url()).pathname !== "/login";
}

async function inspectTab(page, viewport, tab) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await page.getByRole("tab", { name: tab }).click();
  await page.waitForTimeout(250);
  const inspection = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll("a,button,input,select,textarea")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const unnamed = interactive.filter((element) => {
      const id = element.getAttribute("id");
      const labelled = id && document.querySelector(`label[for="${id}"]`);
      return !(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.getAttribute("placeholder") || element.closest("label") || labelled);
    });
    const smallTargets = interactive.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      interactiveCount: interactive.length,
      unnamedCount: unnamed.length,
      smallTargetCount: smallTargets.length,
      smallTargetDetails: smallTargets.map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 40), aria: element.getAttribute("aria-label"), width: Math.round(rect.width), height: Math.round(rect.height), className: element.className };
      }),
      bodyTextLength: document.body.innerText.length,
    };
  });
  const screenshot = `${artifactDir}/${viewport}-${tab.replaceAll(" ", "-")}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const issues = [];
  if (inspection.horizontalOverflow) issues.push(`horizontal overflow ${inspection.scrollWidth}px > ${inspection.viewportWidth}px`);
  if (inspection.unnamedCount) issues.push(`${inspection.unnamedCount} unnamed interactive elements`);
  if (viewport === "mobile" && inspection.smallTargetCount) issues.push(`${inspection.smallTargetCount} visible targets <44px`);
  if (inspection.bodyTextLength < 120) issues.push("tab content appears empty");
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) issues.push(`${pageErrors.length} page errors`);
  if (failedRequests.length) issues.push(`${failedRequests.length} failed requests`);
  const result = { viewport, tab, ...inspection, consoleErrors, pageErrors, failedRequests, issues, screenshot, passed: issues.length === 0 };
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${viewport}/${tab}${issues.length ? ` · ${issues.join("; ")}` : ""}`);
}

async function run() {
  if (!email || !password) throw new Error("AUDIT_EMAIL and AUDIT_PASSWORD are required");
  const browser = await chromium.launch({ headless: true });
  for (const [viewport, contextOptions] of [["desktop", { viewport: { width: 1440, height: 1000 }, locale: "th-TH" }], ["mobile", { ...devices["iPhone 12"], locale: "th-TH" }]]) {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const authReady = await authenticate(page);
    if (!authReady) throw new Error(`Authentication failed for ${viewport}`);
    await page.goto(`${baseUrl}/capture`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(700);
    for (const tab of tabs) await inspectTab(page, viewport, tab);
    await context.close();
  }
  const summary = { baseUrl, generatedAt: new Date().toISOString(), results, passed: results.every((result) => result.passed) };
  writeFileSync(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(`SUMMARY ${summary.passed ? "PASS" : "FAIL"} · ${results.filter((result) => result.passed).length}/${results.length} tab checks`);
  await browser.close();
  if (!summary.passed) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
