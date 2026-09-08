"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>;

// The desktop sidebar and mobile drawer both render this at once (one is
// merely hidden via CSS), so several instances mount together. Supabase's
// realtime client returns the *same* channel object for a repeated topic
// name, and calling `.on()` on a channel another instance already
// subscribed throws — so every mounted instance shares one channel here,
// guarded by a refcount (and a version counter so a stale async setup from
// a fast unmount/remount, e.g. React Strict Mode, can't clobber a newer one).
let channel: Channel | null = null;
let refCount = 0;
let setupVersion = 0;
let latestOthers: string[] = [];
const listeners = new Set<(others: string[]) => void>();

function notify(others: string[]) {
  latestOthers = others;
  listeners.forEach((listen) => listen(others));
}

// Two people share this data, so it helps to know when the other one has it
// open too — a quiet presence dot rather than anything that blocks editing.
export function PresenceIndicator({ compact = false }: { compact?: boolean }) {
  const [others, setOthers] = useState<string[]>(latestOthers);

  useEffect(() => {
    listeners.add(setOthers);
    refCount++;

    if (refCount === 1) {
      setupVersion++;
      const version = setupVersion;
      const supabase = createClient();

      supabase.auth.getUser().then(({ data }) => {
        if (version !== setupVersion) return;
        const email = data.user?.email;
        if (!email) return;

        const chan = supabase.channel("household-presence", {
          config: { presence: { key: email } },
        });
        channel = chan;

        chan
          .on("presence", { event: "sync" }, () => {
            const state = chan.presenceState<{ email: string }>();
            const emails = Object.values(state)
              .flat()
              .map((p) => p.email)
              .filter((e) => e && e !== email);
            notify(Array.from(new Set(emails)));
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await chan.track({ email, online_at: new Date().toISOString() });
            }
          });
      });
    }

    return () => {
      listeners.delete(setOthers);
      refCount--;
      if (refCount === 0) {
        setupVersion++;
        if (channel) {
          createClient().removeChannel(channel);
          channel = null;
        }
        notify([]);
      }
    };
  }, []);

  if (others.length === 0) return null;

  const label = others[0].split("@")[0];

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${others.join(", ")} ${others.length === 1 ? "is" : "are"} also online`}
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {!compact && <span className="truncate text-xs text-hero-text-muted">{label} is online</span>}
    </div>
  );
}
