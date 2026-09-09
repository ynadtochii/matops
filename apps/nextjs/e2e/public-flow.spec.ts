import { expect, test } from "@playwright/test";

test("visitor can return to sign in from the privacy page", async ({
  page,
}) => {
  await page.goto("/privacy");

  await expect(
    page.getByRole("heading", { name: "Privacy at MatOps" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to MatOps" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
