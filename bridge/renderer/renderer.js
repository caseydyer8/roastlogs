"use strict";

// Renderer script — talks only through window.roastlogs (see preload.js).
// No Node/network access here by design; this is plain DOM + IPC.

const el = (id) => document.getElementById(id);
const hostInput = el("host");
const urlInput = el("url");
const keyInput = el("key");
const emailInput = el("email");
const passwordInput = el("password");
const connectBtn = el("connectBtn");
const btValue = el("btValue");
const btAge = el("btAge");
const logEl = el("log");

let connected = false;
let lastSampleAt = 0;

const DOT_CLASS = { live: "dot live", joined: "dot live", connecting: "dot pulse", reconnecting: "dot pulse", joining: "dot pulse", authenticating: "dot pulse", stale: "dot bad", error: "dot bad", closed: "dot", idle: "dot" };

function setLamp(dotId, txtId, state) {
  el(dotId).className = DOT_CLASS[state] || "dot";
  el(txtId).textContent = state;
}

function logLine(text, isErr) {
  const row = document.createElement("div");
  if (isErr) row.className = "err";
  const t = new Date().toLocaleTimeString([], { hour12: false });
  row.textContent = `${t}  ${text}`;
  logEl.appendChild(row);
  while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

window.roastlogs.getSettings().then((s) => {
  if (s.host) hostInput.value = s.host;
  if (s.supabaseUrl) urlInput.value = s.supabaseUrl;
  if (s.supabaseKey) keyInput.value = s.supabaseKey;
  if (s.email) emailInput.value = s.email;
  if (s.password) passwordInput.value = s.password;
});
window.roastlogs.onSettings((s) => {
  if (s.host && !hostInput.value) hostInput.value = s.host;
  if (s.supabaseUrl && !urlInput.value) urlInput.value = s.supabaseUrl;
  if (s.supabaseKey && !keyInput.value) keyInput.value = s.supabaseKey;
});

window.roastlogs.onLamps((l) => {
  setLamp("dotDevice", "txtDevice", l.device);
  setLamp("dotCloud", "txtCloud", l.cloud);
  el("dotViewers").className = l.viewers > 0 ? "dot live" : "dot";
  el("txtViewers").textContent = String(l.viewers);
});

window.roastlogs.onSample((s) => {
  lastSampleAt = Date.now();
  btValue.innerHTML = `<span class="bt">${Math.round(s.bt)}</span><span class="unit">&deg;F BT</span>`;
});

window.roastlogs.onHealth((h) => {
  if (h.btValid === false) logLine(`bean probe fault (state: ${h.btState})`, true);
});

window.roastlogs.onEvent((e) => logLine(`device event: ${e.label}`));

window.roastlogs.onError((e) => logLine(`${e.source} error: ${e.message}`, true));

setInterval(() => {
  if (!lastSampleAt) return;
  const secs = Math.round((Date.now() - lastSampleAt) / 1000);
  btAge.textContent = secs < 3 ? "" : `${secs}s ago`;
}, 1000);

connectBtn.addEventListener("click", async () => {
  if (connected) {
    connectBtn.disabled = true;
    await window.roastlogs.disconnect();
    connected = false;
    connectBtn.textContent = "Connect";
    connectBtn.classList.remove("stop");
    connectBtn.disabled = false;
    logLine("disconnected");
    return;
  }

  const host = hostInput.value.trim() || "roastlink.local";
  const supabaseUrl = urlInput.value.trim();
  const supabaseKey = keyInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!supabaseUrl || !supabaseKey) {
    logLine("Supabase URL and key are required", true);
    return;
  }
  if (!email || !password) {
    logLine("Bridge account email and password are required -- the live channel is private.", true);
    return;
  }
  // This field is for the PUBLISHABLE key only -- it's meant to be public and
  // is powerless against real data under the admin-only + aal2 RLS policies.
  // A service_role/secret key pasted here by mistake would be genuinely
  // sensitive and get written to ~/.roastlogs-bridge.json in plaintext, so
  // refuse anything that looks like one before it's ever saved.
  if (/^sb_secret_|service_role/i.test(supabaseKey)) {
    logLine("That looks like a service_role/secret key -- use the publishable key instead.", true);
    return;
  }

  connectBtn.disabled = true;
  setLamp("dotDevice", "txtDevice", "connecting");
  setLamp("dotCloud", "txtCloud", "connecting");
  logLine(`connecting to ${host}...`);
  try {
    const res = await window.roastlogs.connect({ host, supabaseUrl, supabaseKey, email, password });
    if (res && res.ok) {
      connected = true;
      connectBtn.textContent = "Disconnect";
      connectBtn.classList.add("stop");
    } else {
      logLine(`connect failed: ${res && res.error ? res.error : "unknown error"}`, true);
    }
  } catch (err) {
    logLine(`connect failed: ${err && err.message ? err.message : err}`, true);
  } finally {
    connectBtn.disabled = false;
  }
});
