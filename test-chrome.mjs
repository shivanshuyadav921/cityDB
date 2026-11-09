import puppeteer from "puppeteer-core";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function inspectFailedRequests() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
  });

  const page = await browser.newPage();

  page.on("response", async (res) => {
    const status = res.status();
    if (status >= 400) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (e) {
        bodyText = `<cannot read body: ${e.message}>`;
      }
      console.log(`[HTTP ${status}] ${res.request().method()} ${res.url()} => ${bodyText.slice(0, 300)}`);
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Console error]`, msg.text());
    }
  });

  try {
    await page.goto("https://citydb-woad.vercel.app", { waitUntil: "networkidle2", timeout: 30000 });

    // Click execute button to see what happens
    const runBtn = await page.$("#run-query-btn");
    if (runBtn) {
      console.log("Triggering query execution...");
      await runBtn.click();
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (err) {
    console.error("Error during audit:", err);
  } finally {
    await browser.close();
  }
}

inspectFailedRequests();
