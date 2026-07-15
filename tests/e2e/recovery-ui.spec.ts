import { test, expect } from "@playwright/test";

const DISPOSABLE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function acknowledgeWarning(page: import("@playwright/test").Page) {
  await page.locator('label.ack input[type="checkbox"]').check();
}

test.describe("recovery UI safety", () => {
  test("shows warning and keeps key field disabled until acknowledgement", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Only use this tool from the official Grow GitHub repository")
    ).toBeVisible();
    await expect(page.locator("#pk")).toBeDisabled();
    await acknowledgeWarning(page);
    await expect(page.locator("#pk")).toBeEnabled();
  });

  test("shows EVM import steps without Solana option", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Recover your Grow account" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Solana" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "EVM networks" })).toHaveCount(
      0
    );
    await expect(
      page.getByText("import your Solana recovery key into Phantom", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import & show positions" })
    ).toBeVisible();
  });

  test("hides private key input on blur and does not persist key", async ({
    page,
  }) => {
    await page.goto("/");
    await acknowledgeWarning(page);
    await page.locator("#pk").fill(DISPOSABLE_KEY);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.locator("#pk")).toHaveAttribute("type", "text");

    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await expect(page.locator("#pk")).toHaveAttribute("type", "password");

    const storageLeak = await page.evaluate((key) => {
      const haystacks = [
        window.localStorage.getItem("pk"),
        window.sessionStorage.getItem("pk"),
        JSON.stringify(window.localStorage),
        JSON.stringify(window.sessionStorage),
        document.cookie,
      ]
        .filter(Boolean)
        .join("|");
      return haystacks.includes(key.slice(2));
    }, DISPOSABLE_KEY);
    expect(storageLeak).toBe(false);
  });

  test("noindex robots meta present", async ({ page }) => {
    await page.goto("/");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/i);
  });
});
