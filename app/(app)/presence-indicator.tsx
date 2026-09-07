"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Two people share this data, so it helps to know when the other one has it
// open too — a quiet presence dot rather than anything that blocks editing.
export function PresenceIndicator({ compact = false }: { compact?: boolean }) {
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (!email || cancelled) return;

      channel = supabase.channel("household-presence", {
        config: { presence: { key: email } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ email: string }>();
          const emails = Object.values(state)
            .flat()
            .map((p) => p.email)
            .filter((e) => e && e !== email);
          setOthers(Array.from(new Set(emails)));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel!.track({ email, online_at: new Date().toISOString() });
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
