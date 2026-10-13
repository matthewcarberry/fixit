import { expect, test, type Page } from "@playwright/test";
import { ADMIN, PNG_1PX, REQUESTER } from "./fixtures";

const shots = process.env.FIXIT_SCREENSHOTS;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

async function attemptSignIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signIn(page: Page, who: { email: string; password: string }) {
  await attemptSignIn(page, who);
  await expect(page.getByRole("heading", { name: "Sign in to Fixit" })).toHaveCount(0);
}

async function signOut(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Fixit" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("first run: Matt creates the admin account and adds Sam", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Fixit" })).toBeVisible();
  await snap(page, "01-setup");
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();

  await page.goto("/settings/people");
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name").fill(REQUESTER.name);
  await page.getByLabel("Email").fill(REQUESTER.email);
  await page.getByLabel("Starting password").fill(REQUESTER.startingPassword);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("no email was sent")).toBeVisible();
  await expect(page.getByText(REQUESTER.email).first()).toBeVisible();
  await snap(page, "02-people");
  await signOut(page);
});

test("Sam chooses their own password on first sign-in", async ({ page }) => {
  await signIn(page, { email: REQUESTER.email, password: REQUESTER.startingPassword });
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  await page.getByLabel("Password you were given").fill(REQUESTER.startingPassword);
  await page.getByLabel("New password").fill(REQUESTER.password);
  await page.getByLabel("Type it again").fill(REQUESTER.password);
  await snap(page, "02b-choose-password");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
  await signOut(page);
});

test("Sam reports a problem with a photo and no category", async ({ page }) => {
  await signIn(page, REQUESTER);
  await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
  await page.getByRole("link", { name: "New" }).click();
  await page.getByLabel("What's wrong?").fill("Wifi keeps dropping upstairs");
  await page.getByLabel("Details").fill("Started yesterday. Restarting the router didn't help.");
  await page.getByRole("button", { name: /Urgent/ }).click();
  await page.getByTestId("photo-input").setInputFiles({ name: "router.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByRole("button", { name: "Remove photo 1" })).toBeVisible();
  await snap(page, "03-new-ticket");
  await page.getByRole("button", { name: "Send to Fixit" }).click();

  await expect(page.getByRole("heading", { name: "Wifi keeps dropping upstairs" })).toBeVisible();
  await expect(page.getByText("HOME-1")).toBeVisible();
  await expect(page.getByText("Uncategorized")).toBeVisible();
  await expect(page.getByRole("img", { name: "router.png" })).toBeVisible();
  await snap(page, "04-ticket-requester");
  await signOut(page);
});

test("Matt triages, asks a question and leaves a private note", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByLabel("1 unread").filter({ visible: true })).toBeVisible();
  await snap(page, "05-queue");
  await page.getByRole("link", { name: /Wifi keeps dropping upstairs/ }).click();

  await page.getByLabel("Category").selectOption({ label: "Network / Wifi" });
  await expect(page.getByText("changed category to Network / Wifi")).toBeVisible();

  await page.getByLabel("Internal note").check();
  await page.getByLabel("Reply").fill("Probably the mesh node in the hallway");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Probably the mesh node in the hallway")).toBeVisible();

  await page.getByLabel("Internal note").uncheck();
  await page.getByLabel("Reply").fill("Which room drops the most?");
  await page.getByRole("button", { name: "Send reply" }).click();
  await page.getByLabel("Status").selectOption("waiting_on_requester");
  await expect(page.getByText("Reminders sent: 1")).toBeVisible();
  await snap(page, "06-ticket-admin");
  await signOut(page);
});

test("Sam sees the question, not the private note, and replies", async ({ page }) => {
  await signIn(page, REQUESTER);
  await page.getByRole("link", { name: /Alerts/ }).click();
  await expect(page.getByText(/needs something from you/)).toBeVisible();
  await snap(page, "07-alerts");
  await page.getByText(/needs something from you/).click();

  await expect(page.getByText("This ticket is waiting on you")).toBeVisible();
  await expect(page.getByText("Which room drops the most?")).toBeVisible();
  await expect(page.getByText("Probably the mesh node")).toHaveCount(0);
  await page.getByLabel("Reply").fill("The kids' rooms");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("This ticket is waiting on you")).toHaveCount(0);
  await expect(page.getByText("In progress").first()).toBeVisible();
  await snap(page, "08-replied");
  await signOut(page);
});

test("Matt resolves it and Sam confirms the fix", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/tickets/1");
  await page.getByLabel("Status").selectOption("resolved");
  await expect(page.getByText("Closes automatically unless it's reopened.")).toBeVisible();
  await signOut(page);

  await signIn(page, REQUESTER);
  await page.goto("/tickets/1");
  await page.getByRole("button", { name: "Yes, it's fixed" }).click();
  await expect(page.getByText("This ticket is closed. Still a problem?")).toBeVisible();
});

test("wrong passwords lock the account for a while", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await attemptSignIn(page, { email: "nobody@example.com", password: "wrong password" });
    await expect(page.getByRole("alert")).toContainText("don't match");
  }
  await attemptSignIn(page, { email: "nobody@example.com", password: "wrong password" });
  await expect(page.getByRole("alert")).toContainText("Too many failed sign-ins");
});
