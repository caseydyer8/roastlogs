"use strict";

// Electron main process — owns the Bridge (device <-> Supabase) and a small
// settings file so the host/device address and Supabase creds persist across
// launches. The renderer never touches the network directly; it only sends
// IPC commands and receives lamp/sample/log events via the preload bridge.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Bridge } = require("./lib/bridge");
const { isSecretKey } = require("./lib/keyCheck");

const SETTINGS_PATH = path.join(os.homedir(), ".roastlogs-bridge.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (_) {
    return {};
  }
}

function saveSettings(next) {
  const merged = { ...loadSettings(), ...next };
  try {
    // This file holds the bridge's Supabase password in plaintext, so it must
    // never be group/world readable. `mode` only applies when writeFileSync
    // CREATES the file -- an existing 0644 file written by an earlier build
    // keeps its old mode -- so the explicit chmod is what actually closes it.
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
    fs.chmodSync(SETTINGS_PATH, 0o600);
  } catch (e) {
    console.error("failed to save settings:", e.message);
  }
  return merged;
}

// Fixed refusal texts for the connect handler. They name no value.
const SECRET_REFUSED = "A service_role/secret key was pasted into one of the fields -- refused.";
const SECRET_REFUSED_ALREADY_SAVED =
  "A service_role/secret key was pasted into one of the fields -- refused. " +
  "A key like this is ALREADY saved in ~/.roastlogs-bridge.json -- replace it with the " +
  "publishable key and rotate the secret key in the Supabase dashboard.";

let win = null;
let bridge = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    title: "RoastLogs Bridge",
    backgroundColor: "#15120f", // matches theme.css --bg-primary (dark)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  const settings = loadSettings();
  send("settings", settings);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (bridge) bridge.stop().catch(() => {});
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("connect", async (_evt, { host, supabaseUrl, supabaseKey, email, password }) => {
  try {
    // The renderer has a text-only pre-check (renderer.js) that cannot see a
    // JWT's role claim -- this main-process check is the one that counts. It
    // runs first so a refused paste changes nothing: no running bridge is
    // stopped and nothing is written to disk. Every message is fixed text on
    // purpose; no submitted value is ever echoed or logged.
    //
    // A non-string key would slip past isSecretKey (which is false for
    // non-strings) and JSON.stringify straight into the settings file, so it
    // is refused before the secret check.
    if (typeof supabaseKey !== "string" || supabaseKey.trim() === "") {
      return { ok: false, error: "Supabase key is missing or not text." };
    }
    // All five fields, not just the key: a secret key pasted into the URL or
    // host box would be written to disk in plaintext just the same.
    if ([host, supabaseUrl, supabaseKey, email, password].some((v) => isSecretKey(v))) {
      // Read-only: warn if an earlier build already saved a secret key.
      const alreadySaved = isSecretKey((loadSettings() || {}).supabaseKey);
      return {
        ok: false,
        error: alreadySaved ? SECRET_REFUSED_ALREADY_SAVED : SECRET_REFUSED,
      };
    }
    if (bridge) {
      await bridge.stop().catch(() => {});
      bridge = null;
    }
    // Settings (including the bridge account password) live in
    // ~/.roastlogs-bridge.json -- outside the repo, never committed.
    saveSettings({ host, supabaseUrl, supabaseKey, email, password });

    bridge = new Bridge({ host, supabaseUrl, supabaseKey, email, password });
    bridge.on("lamps", (l) => send("lamps", l));
    bridge.on("sample", (s) => send("sample", s));
    bridge.on("health", (h) => send("health", h));
    bridge.on("event", (e) => send("event", e));
    bridge.on("error", (e) => send("bridge-error", { source: e.source, message: e.error.message }));
    bridge.start();
    return { ok: true };
  } catch (err) {
    // Constructing the Supabase client can throw synchronously on a malformed
    // URL/key. Without this catch the IPC promise rejects, the renderer's
    // await throws unhandled, and the UI silently stays on "idle" forever --
    // exactly the failure mode this is guarding against.
    console.error("connect failed:", err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle("disconnect", async () => {
  if (bridge) {
    await bridge.stop().catch(() => {});
    bridge = null;
  }
  send("lamps", { device: "idle", cloud: "idle", viewers: 0 });
  return { ok: true };
});

ipcMain.handle("get-settings", () => loadSettings());
