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
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error("failed to save settings:", e.message);
  }
  return merged;
}

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
