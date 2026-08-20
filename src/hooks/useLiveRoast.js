import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { computeRoR } from "../lib/ror";

// Subscribes to the RoastLink bridge's Supabase Realtime broadcast and exposes
// the live bean temp, a smoothed RoR, and a connection status. Read-only and
// ephemeral: this hook never writes anything. It also registers itself in the
// channel's presence as a "viewer" so the bridge's Viewers lamp counts real
// screens.
//
// Status: idle -> connecting -> live, dropping to "stale" if samples stop
// arriving (WiFi drop / bridge down) so the UI can fall back to manual entry.

const CHANNEL = "roastlink-live";
const STALE_MS = 6000;
const BUFFER_MS = 40000;

export function useLiveRoast() {
  const [status, setStatus] = useState("idle");
  const [latest, setLatest] = useState(null);
  const [ror, setRor] = useState(null);
  const [viewers, setViewers] = useState(0);
  const bufferRef = useRef([]);
  const lastAtRef = useRef(0);

  useEffect(() => {
    setStatus("connecting");
    const channel = supabase.channel(CHANNEL, {
      config: {
        broadcast: { self: false },
        presence: { key: `viewer-${Math.random().toString(36).slice(2, 8)}` },
      },
    });

    channel.on("broadcast", { event: "sample" }, ({ payload }) => {
      if (!payload || typeof payload.bt !== "number") return;
      const now = Date.now();
      lastAtRef.current = now;
      setLatest(payload);

      const buf = bufferRef.current;
      buf.push({ t: now, bt: payload.bt });
      const cutoff = now - BUFFER_MS;
      while (buf.length && buf[0].t < cutoff) buf.shift();
      setRor(computeRoR(buf));
      setStatus("live");
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      let n = 0;
      for (const k of Object.keys(state)) {
        for (const p of state[k]) if (p.role === "viewer") n += 1;
      }
      setViewers(n);
    });

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") channel.track({ role: "viewer", at: Date.now() });
    });

    const watchdog = setInterval(() => {
      if (lastAtRef.current && Date.now() - lastAtRef.current > STALE_MS) {
        setStatus((prev) => (prev === "live" ? "stale" : prev));
      }
    }, 1000);

    return () => {
      clearInterval(watchdog);
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    status,
    isLive: status === "live",
    latest,
    bt: latest && typeof latest.bt === "number" ? latest.bt : null,
    ror,
    ambient: latest ? { at: latest.at, ah: latest.ah } : null,
    viewers,
  };
}
