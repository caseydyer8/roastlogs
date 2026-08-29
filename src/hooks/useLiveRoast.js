import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { computeRoR } from "../lib/ror";

// Subscribes to the RoastLink bridge's Supabase Realtime broadcast and exposes
// the live bean temp, a smoothed RoR, and a connection status. Read-only and
// ephemeral: this hook never writes anything. It also registers itself in the
// channel's presence as a "viewer" so the bridge's Viewers lamp counts real
// screens.
//
// Status has two independent signals folded into one string, because "is the
// Mac app running" and "is the device delivering temps" are genuinely
// different failures a phone user needs to tell apart without walking over to
// the Mac:
//   idle        -> hook just mounted, not subscribed yet
//   connecting  -> subscribed, waiting for the first presence sync
//   no-bridge   -> subscribed, no one publishing role:"bridge" on this channel
//                  (the desktop bridge app isn't running / isn't connected)
//   bridge-only -> a bridge IS present, but no sample has arrived recently
//                  (device unreachable, probe fault, or bridge just started)
//   live        -> a fresh sample arrived within the last STALE_MS

const CHANNEL = "roastlink-live";
const STALE_MS = 6000;
const BUFFER_MS = 40000;

export function useLiveRoast() {
  const [status, setStatus] = useState("idle");
  const [latest, setLatest] = useState(null);
  const [ror, setRor] = useState(null);
  const [viewers, setViewers] = useState(0);
  const [bridgePresent, setBridgePresent] = useState(false);
  const bufferRef = useRef([]);
  const lastAtRef = useRef(0);
  const bridgePresentRef = useRef(false);
  const presenceSyncedRef = useRef(false);

  useEffect(() => {
    setStatus("connecting");
    const channel = supabase.channel(CHANNEL, {
      config: {
        // private routes this channel through RLS on realtime.messages: only
        // an admin session that has completed MFA can receive live temps, and
        // only the bridge identity can publish them.
        private: true,
        broadcast: { self: false },
        presence: { key: `viewer-${Math.random().toString(36).slice(2, 8)}` },
      },
    });

    const recompute = () => {
      const now = Date.now();
      if (!presenceSyncedRef.current) {
        setStatus((prev) => (prev === "idle" ? "connecting" : prev));
        return;
      }
      if (lastAtRef.current && now - lastAtRef.current <= STALE_MS) {
        setStatus("live");
      } else if (bridgePresentRef.current) {
        setStatus("bridge-only");
      } else {
        setStatus("no-bridge");
      }
    };

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
      let viewerCount = 0;
      let sawBridge = false;
      for (const k of Object.keys(state)) {
        for (const p of state[k]) {
          if (p.role === "viewer") viewerCount += 1;
          if (p.role === "bridge") sawBridge = true;
        }
      }
      setViewers(viewerCount);
      bridgePresentRef.current = sawBridge;
      setBridgePresent(sawBridge);
      presenceSyncedRef.current = true;
      recompute();
    });

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") channel.track({ role: "viewer", at: Date.now() });
    });

    const watchdog = setInterval(recompute, 1000);

    return () => {
      clearInterval(watchdog);
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    status,
    isLive: status === "live",
    bridgePresent,
    latest,
    bt: latest && typeof latest.bt === "number" ? latest.bt : null,
    ror,
    ambient: latest ? { at: latest.at, ah: latest.ah } : null,
    viewers,
  };
}
