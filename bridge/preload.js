"use strict";

// Preload: the only bridge between the sandboxed renderer and the main
// process. contextIsolation is on and nodeIntegration is off, so the renderer
// gets exactly this surface — no direct fs/net/child_process access.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("roastlogs", {
  connect: (opts) => ipcRenderer.invoke("connect", opts),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  onSettings: (cb) => ipcRenderer.on("settings", (_e, v) => cb(v)),
  onLamps: (cb) => ipcRenderer.on("lamps", (_e, v) => cb(v)),
  onSample: (cb) => ipcRenderer.on("sample", (_e, v) => cb(v)),
  onHealth: (cb) => ipcRenderer.on("health", (_e, v) => cb(v)),
  onEvent: (cb) => ipcRenderer.on("event", (_e, v) => cb(v)),
  onError: (cb) => ipcRenderer.on("bridge-error", (_e, v) => cb(v)),
});
