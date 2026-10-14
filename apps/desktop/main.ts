import {
  app,
  BrowserWindow,
  dialog,
  nativeTheme,
  safeStorage,
  shell,
  utilityProcess,
} from "electron";
import { join, resolve } from "node:path";

if (process.env.SOCIUS_USER_DATA)
  app.setPath("userData", resolve(process.env.SOCIUS_USER_DATA));
let child: Electron.UtilityProcess | undefined;
let window: BrowserWindow | undefined;
let runtimeOrigin = "";
let quitting = false;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});

function showWindow(url: string) {
  window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 850,
    minHeight: 620,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111111" : "#ffffff",
    title: "Socius",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 20 },
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, destination) => {
    if (new URL(destination).origin !== runtimeOrigin) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
    window = undefined;
  });
  void window.loadURL(url);
}

app
  .whenReady()
  .then(() => {
    if (!singleInstance) return;
    child = utilityProcess.fork(join(__dirname, "runtime-worker.cjs"), [], {
      serviceName: "Socius runtime",
      stdio: "pipe",
    });
    const timeout = setTimeout(() => {
      dialog.showErrorBox(
        "Socius could not start",
        "The local runtime did not start. Check the application logs.",
      );
      app.quit();
    }, 20000);
    child.on(
      "message",
      async (message: {
        type: string;
        url?: string;
        origin?: string;
        id?: string;
        operation?: string;
        value?: string;
      }) => {
        if (message.type === "ready" && message.url && message.origin) {
          clearTimeout(timeout);
          runtimeOrigin = message.origin;
          showWindow(message.url);
          return;
        }
        if (message.type === "secret" && message.id && message.value) {
          try {
            if (!safeStorage.isEncryptionAvailable())
              throw new Error("OS credential encryption unavailable");
            if (
              process.platform === "linux" &&
              safeStorage.getSelectedStorageBackend() === "basic_text"
            )
              throw new Error("Secure key storage unavailable");
            const value =
              message.operation === "encrypt"
                ? safeStorage.encryptString(message.value).toString("base64")
                : safeStorage.decryptString(
                    Buffer.from(message.value, "base64"),
                  );
            child?.postMessage({
              type: "secret-result",
              id: message.id,
              value,
            });
          } catch {
            child?.postMessage({
              type: "secret-result",
              id: message.id,
              error: "Secure credential storage unavailable",
            });
          }
        }
        if (message.type === "open-external" && message.url) {
          // Only HTTPS provider sign-in pages may leave the app.
          try {
            if (new URL(message.url).protocol === "https:")
              void shell.openExternal(message.url);
          } catch {
            /* Ignore malformed URLs. */
          }
          return;
        }
        if (message.type === "startup-error") {
          clearTimeout(timeout);
          dialog.showErrorBox(
            "Socius could not start",
            "The runtime could not open its local database.",
          );
          app.quit();
        }
      },
    );
    child.on("exit", () => {
      if (!quitting) {
        dialog.showErrorBox(
          "Socius runtime stopped",
          "Restart Socius to recover your saved conversations.",
        );
        app.quit();
      }
    });
    const secretStorage =
      safeStorage.isEncryptionAvailable() &&
      !(
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text"
      );
    child.postMessage({
      type: "start",
      dataDir: join(app.getPath("userData"), "workspace"),
      preferredPort: Number(process.env.SOCIUS_RUNTIME_PORT ?? 47613),
      webDir: join(__dirname, "web"),
      secretStorage,
    });
  })
  .catch(() => app.quit());
app.on("activate", () => {
  if (!window && runtimeOrigin) showWindow(runtimeOrigin);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  quitting = true;
  child?.kill();
});
