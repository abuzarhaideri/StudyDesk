import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialState } from "../../shared/domain";

const executablePath = process.env.STUDYDESK_EXECUTABLE;
let profile: string;
let app: ElectronApplication;
let page: Page;
let errors: string[];
async function launch() {
  app = await electron.launch({
    executablePath,
    args: executablePath ? [] : [process.cwd()],
    env: { ...process.env, STUDYDESK_TEST_DATA: profile },
    timeout: 30000,
  });
  page = await app.firstWindow();
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await app.context().setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}
async function nav(name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function newTask(title: string) {
  await page.getByRole("button", { name: "Quick add task" }).click();
  await page.getByLabel("Task title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Practice chapter exercises");
  await page.getByLabel("Category", { exact: true }).fill("Mathematics");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "studydesk-e2e-"));
});
test.afterEach(async () => {
  if (app) await app.close().catch(() => {});
  expect(errors ?? []).toEqual([]);
});

test("complete desktop workflow, autosave, themes, backups and restart persistence", async () => {
  await launch();
  await expect(page.getByText("A clear desk. A fresh start.")).toBeVisible();
  await newTask("Revise algebra");
  await nav("Tasks");
  await page
    .getByRole("button", { name: "Edit Revise algebra", exact: true })
    .click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Revise algebra and geometry");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Complete Revise algebra and geometry",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Reopen Revise algebra and geometry",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: /^Completed/ }).click();
  await expect(
    page.getByText("Revise algebra and geometry", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Reopen Revise algebra and geometry",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /^All \d/ }).click();
  await page.getByLabel("Search tasks", { exact: true }).fill("no-such-task");
  await expect(page.getByText("Nothing here just yet.")).toBeVisible();
  await page.getByLabel("Clear task search").click();
  await page.getByLabel("Sort tasks").selectOption("priority");
  await newTask("Temporary task");
  await page
    .getByRole("button", { name: "Delete Temporary task", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByText("Temporary task", { exact: true })).toHaveCount(
    0,
  );
  await nav("Notes");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Algebra revision");
  await page
    .getByLabel("Note body", { exact: true })
    .fill(
      "The quadratic formula and a few quiet thoughts.\nRemember to check both roots.",
    );
  await page.getByLabel("Pin note", { exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search notes").fill("quadratic");
  await expect(
    page.getByRole("button", { name: /Algebra revision/ }),
  ).toBeVisible();
  await nav("Focus");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause session", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause session", exact: true })
    .click();
  const paused = await page.getByRole("timer").textContent();
  await page.waitForTimeout(1100);
  await expect(page.getByRole("timer")).toHaveText(paused!);
  await page
    .getByRole("button", { name: "Resume session", exact: true })
    .click();
  await page.getByLabel("Reset timer").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(page.getByRole("timer")).toHaveText("25:00");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Focus duration", { exact: true }).fill("35");
  await page.getByLabel("Short break duration", { exact: true }).fill("7");
  await page.getByLabel("Long break duration", { exact: true }).fill("18");
  await page
    .getByRole("button", { name: "Save durations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ animations: "disabled", path: "docs/screenshots/settings-dark.png" });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Exercise the real export/import handlers with native dialog selection controlled in main.
  const backupPath = join(profile, "export.json");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, backupPath);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByText("Backup exported.", { exact: true }),
  ).toBeVisible();
  const exported = JSON.parse(await readFile(backupPath, "utf8"));
  expect(exported.tasks).toHaveLength(1);
  expect(exported.notes[0].pinned).toBe(true);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, backupPath);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText("Backup restored. Your previous data was preserved.", {
      exact: true,
    }),
  ).toBeVisible();
  await nav("Dashboard");
  await page.screenshot({ animations: "disabled", path: "docs/screenshots/dashboard-light.png" });
  expect(
    await page.evaluate(
      () => typeof (window as unknown as Record<string, unknown>).require,
    ),
  ).toBe("undefined");
  expect(
    await page.evaluate(() => Object.keys(window.studyDesk).sort()),
  ).toEqual(["backup", "dispatch", "load", "subscribe"]);
  expect(errors).toEqual([]);
  await app.close();
  await launch();
  await nav("Tasks");
  await expect(
    page.getByText("Revise algebra and geometry", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Complete Revise algebra and geometry",
      exact: true,
    }),
  ).not.toBeChecked();
  await nav("Notes");
  await expect(page.getByLabel("Note title")).toHaveValue("Algebra revision");
  await expect(page.getByLabel("Note body")).toHaveValue(/check both roots/);
  await expect(page.getByLabel("Unpin note")).toBeVisible();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title").fill("Delete this note");
  await page.getByLabel("Delete note", { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(page.getByLabel("Note title")).toHaveValue("Algebra revision");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Focus duration")).toHaveValue("35");
  await expect(page.getByLabel("Short break duration")).toHaveValue("7");
  await expect(page.getByLabel("Long break duration")).toHaveValue("18");
  await expect(
    page.getByRole("button", { name: "Light", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav("Focus");
  await expect(page.getByRole("timer")).toHaveText("35:00");
  await page.screenshot({ animations: "disabled", path: "docs/screenshots/focus-light.png" });
  // Verify minimum supported desktop size has no horizontal overflow.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(860, 620),
  );
  for (const name of ["Dashboard", "Tasks", "Focus", "Notes"]) {
    await nav(name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("recovers an expired timer once, preserves malformed files and validates IPC", async () => {
  const s = initialState();
  const deadline = Date.now() - 1000;
  s.timer = {
    ...s.timer,
    status: "running",
    startedAt: deadline - s.timer.durationMs,
    deadline,
  };
  await writeFile(join(profile, "studydesk.json"), JSON.stringify({ data: s }));
  await launch();
  await nav("Focus");
  await expect(
    page.getByRole("button", { name: "Short break", exact: true }),
  ).toHaveClass(/selected/);
  expect(
    (await page.evaluate(() => window.studyDesk.load())).state.sessions,
  ).toHaveLength(1);
  const invalid = await page.evaluate(() =>
    window.studyDesk.dispatch({
      type: "task.create",
      data: {
        title: "",
        priority: "high",
        category: "",
        description: "",
        dueDate: null,
      },
    }),
  );
  expect(invalid.ok).toBe(false);
  await app.close();
  await launch();
  expect(
    (await page.evaluate(() => window.studyDesk.load())).state.sessions,
  ).toHaveLength(1);
  await app.close();
  await writeFile(
    join(profile, "studydesk.json"),
    "{invalid JSON, preserve me",
  );
  await launch();
  await expect(
    page.getByText(/We recovered from a damaged data file/),
  ).toBeVisible();
  const backups = (await readdir(profile)).filter((f) =>
    f.includes(".damaged-"),
  );
  expect(backups).toHaveLength(1);
  expect(await readFile(join(profile, backups[0]), "utf8")).toBe(
    "{invalid JSON, preserve me",
  );
});

test("active timer survives app restart and completed live session is recorded once", async () => {
  await launch();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Focus duration").fill("1");
  await page
    .getByRole("button", { name: "Save durations", exact: true })
    .click();
  await nav("Focus");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  const original = (await page.evaluate(() => window.studyDesk.load())).state
    .timer;
  await app.close();
  await launch();
  await nav("Focus");
  await expect(
    page.getByRole("button", { name: "Pause session", exact: true }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.studyDesk.load())).state.timer.deadline,
  ).toBe(original.deadline);
  // Advance main's wall clock; renderer remains real. This exercises the actual main timer loop.
  await app.evaluate(() => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + 61000;
  });
  await expect(
    page.getByRole("button", { name: "Short break", exact: true }),
  ).toHaveClass(/selected/);
  await page.waitForTimeout(1100);
  expect(
    (await page.evaluate(() => window.studyDesk.load())).state.sessions,
  ).toHaveLength(1);
});
