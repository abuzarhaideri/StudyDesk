import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Notification,
  powerMonitor,
  session,
} from "electron";
import Store from "electron-store";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import {
  applyCommand,
  initialState,
  reconcile,
  StateSchema,
  type State,
} from "../../shared/domain";

const here = dirname(fileURLToPath(import.meta.url));
app.setName("StudyDesk");
// Test isolation is explicit and never changes the regular profile.
if (process.env.STUDYDESK_TEST_DATA)
  app.setPath("userData", process.env.STUDYDESK_TEST_DATA);
let win: BrowserWindow | null = null;
let store: Store<{ data: State }>;
let state: State;
let warning: string | null = null;
const devURL = process.env.ELECTRON_RENDERER_URL;
function trusted(event: Electron.IpcMainInvokeEvent): void {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("Untrusted sender");
}
function commit(next: State): void {
  store.set("data", next); // electron-store writes atomically before returning.
  state = next;
}
function checkTimer(live: boolean): void {
  const next = reconcile(state, Date.now(), live);
  if (next === state) return;
  const mode = state.timer.mode;
  try {
    commit(next);
    win?.webContents.send("state", state);
    if (live && state.settings.notifications && Notification.isSupported())
      new Notification({
        title:
          mode === "focus"
            ? "A little progress, well earned."
            : "Ready for a fresh start?",
        body:
          mode === "focus"
            ? "Your focus session is complete. Time for a break."
            : "Your break is complete. Come back when you’re ready.",
      }).show();
  } catch (error) {
    console.error("Timer persistence failed", error);
  }
}
function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    title: "StudyDesk",
    backgroundColor: "#f8f9f5",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 22, y: 20 },
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  if (devURL && !app.isPackaged) void win.loadURL(devURL);
  else void win.loadFile(join(here, "../renderer/index.html"));
  win.on("closed", () => {
    win = null;
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (!win && app.isReady()) createWindow();
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  void app
    .whenReady()
    .then(() => {
      mkdirSync(app.getPath("userData"), { recursive: true });
      const path = join(app.getPath("userData"), "studydesk.json");
      try {
        if (existsSync(path))
          StateSchema.parse(JSON.parse(readFileSync(path, "utf8")).data);
      } catch {
        const backup = `${path}.damaged-${Date.now()}.bak`;
        copyFileSync(path, backup);
        // Original data is preserved byte-for-byte; the malformed file is replaced only after backup succeeds.
        writeFileSync(path, JSON.stringify({ data: initialState() }));
        warning = `We recovered from a damaged data file. Your original file is preserved at ${backup}.`;
      }
      store = new Store({
        name: "studydesk",
        defaults: { data: initialState() },
        clearInvalidConfig: false,
      });
      state = StateSchema.parse(store.get("data"));
      checkTimer(false);
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const local =
          details.url.startsWith("file:") ||
          (devURL &&
            !app.isPackaged &&
            (details.url.startsWith(devURL) ||
              details.url.startsWith(devURL.replace("http:", "ws:"))));
        callback({ cancel: !local });
      });
      ipcMain.handle("load", (event) => {
        trusted(event);
        checkTimer(false);
        return { state, warning, version: app.getVersion() };
      });
      ipcMain.handle("dispatch", (event, command: unknown) => {
        trusted(event);
        try {
          commit(applyCommand(state, command));
          return { ok: true, state };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not save. Please try again.",
          };
        }
      });
      ipcMain.handle("backup", async (event, action: unknown) => {
        trusted(event);
        try {
          if (action === "export") {
            const result = await dialog.showSaveDialog(win!, {
              defaultPath: "StudyDesk-backup.json",
              filters: [{ name: "JSON backup", extensions: ["json"] }],
            });
            if (result.canceled || !result.filePath)
              return { ok: true, message: "Export cancelled." };
            writeFileSync(result.filePath, JSON.stringify(state, null, 2));
            return { ok: true, message: "Backup exported." };
          }
          if (action !== "import") throw new Error("Unknown backup action");
          const result = await dialog.showOpenDialog(win!, {
            properties: ["openFile"],
            filters: [{ name: "JSON backup", extensions: ["json"] }],
          });
          if (result.canceled)
            return { ok: true, message: "Import cancelled." };
          if (statSync(result.filePaths[0]).size > 25000000)
            throw new Error("Backup is too large (25 MB maximum).");
          const imported = StateSchema.parse(
            JSON.parse(readFileSync(result.filePaths[0], "utf8")),
          );
          const confirm = await dialog.showMessageBox(win!, {
            type: "warning",
            buttons: ["Cancel", "Replace data"],
            defaultId: 0,
            cancelId: 0,
            message: "Replace your current StudyDesk data?",
            detail:
              "A backup of your current data will be saved in the data folder first.",
          });
          if (confirm.response !== 1)
            return { ok: true, message: "Import cancelled." };
          if (existsSync(path))
            copyFileSync(path, `${path}.before-import-${Date.now()}.bak`);
          commit(reconcile(imported, Date.now(), false));
          win?.webContents.send("state", state);
          return {
            ok: true,
            message: "Backup restored. Your previous data was preserved.",
          };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : "Backup failed.",
          };
        }
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "StudyDesk",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "Window",
            submenu: [
              { role: "minimize" },
              { role: "zoom" },
              { role: "front" },
            ],
          },
        ]),
      );
      createWindow();
      const interval = setInterval(() => checkTimer(true), 500);
      powerMonitor.on("resume", () => checkTimer(false));
      app.on("activate", () => {
        if (!win) createWindow();
      });
      app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
      });
      app.on("before-quit", () => clearInterval(interval));
    })
    .catch((error) => {
      dialog.showErrorBox(
        "StudyDesk could not open your desk",
        `Your saved data has not been discarded. ${error instanceof Error ? error.message : String(error)}`,
      );
      app.quit();
    });
}
