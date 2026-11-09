import puppeteer from "puppeteer-core";
import fs from "fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function comprehensiveAudit() {
  console.log("=== STARTING FULL CHROME BROWSER AUDIT ===");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors", "--window-size=1400,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const errors = [];
  const networkLogs = [];

  page.on("response", async (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (e) {
        bodyText = `<cannot read body: ${e.message}>`;
      }
      errors.push({ type: "HTTP", status, url, body: bodyText });
      console.log(`[HTTP ${status}] ${res.request().method()} ${url} => ${bodyText.slice(0, 150)}`);
    } else {
      networkLogs.push({ status, url });
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push({ type: "Console", text: msg.text() });
      console.log(`[Console Error] ${msg.text()}`);
    }
  });

  try {
    console.log("1. Navigating to https://citydb-woad.vercel.app...");
    await page.goto("https://citydb-woad.vercel.app", { waitUntil: "networkidle2", timeout: 30000 });
    console.log("✓ Page loaded successfully.");

    // Check title
    const title = await page.title();
    console.log(`✓ Page Title: "${title}"`);

    // Check canvas
    const canvas = await page.$("canvas");
    console.log(`✓ Three.js Canvas detected: ${!!canvas}`);

    // Check buttons
    const buttons = await page.$$eval("button", (btns) => btns.map((b) => b.textContent?.trim() || b.title || "unnamed"));
    console.log(`✓ Interactive buttons found (${buttons.length}):`, buttons);

    // Take screenshot of main screen
    await page.screenshot({ path: "audit-main.png" });
    console.log("✓ Saved screenshot: audit-main.png");

    // Test Schema Modal
    console.log("2. Testing Schema Modal...");
    const schemaBtn = await page.$('button[title*="database schema" i], button::-p-text("Schema")');
    if (schemaBtn) {
      await schemaBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: "audit-schema-modal.png" });
      console.log("✓ Schema Modal opened, screenshot saved.");

      // Close modal
      const closeBtn = await page.$('button::-p-text("✕")');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise((r) => setTimeout(r, 400));
        console.log("✓ Schema Modal closed.");
      }
    }

    // Test Auth Modal
    console.log("3. Testing Auth Modal...");
    const signInBtn = await page.$('button::-p-text("Sign In")');
    if (signInBtn) {
      await signInBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: "audit-auth-modal.png" });
      console.log("✓ Auth Modal opened, screenshot saved.");

      // Test filling demo credentials
      const demoBtn = await page.$('button::-p-text("Fill Demo Credentials")');
      if (demoBtn) {
        await demoBtn.click();
        console.log("✓ Filled demo credentials.");
      }

      // Close modal
      const closeBtn = await page.$('button::-p-text("✕")');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise((r) => setTimeout(r, 400));
        console.log("✓ Auth Modal closed.");
      }
    }

    // Test Query Execution Button
    console.log("4. Testing Query Execution...");
    const runBtn = await page.$("#run-query-btn");
    if (runBtn) {
      await runBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      await page.screenshot({ path: "audit-query-executed.png" });
      console.log("✓ Query execution button clicked, screenshot saved.");
    }

    console.log("\n=== AUDIT SUMMARY ===");
    console.log(`Total Network Requests: ${networkLogs.length}`);
    console.log(`Total Errors Encountered: ${errors.length}`);
    if (errors.length > 0) {
      console.log("Errors detail:", JSON.stringify(errors, null, 2));
    }
  } catch (err) {
    console.error("Audit failed with exception:", err);
  } finally {
    await browser.close();
  }
}

comprehensiveAudit();
