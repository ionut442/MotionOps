import { expect, test } from "@playwright/test";

test("Phase 2 production shell does not render Phase 0 lab controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Motion API Lab")).toHaveCount(0);
  await expect(page.getByText(/Create\/Refresh P0-|Run P0-|target pipeline/)).toHaveCount(0);
});
