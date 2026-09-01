"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const supabase = createClient();

      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(rawHash);
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/update-password");
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/update-password");
        return;
      }

      setError(
        "This link is missing the expected sign-in details. It may have already been used — ask for a new invite.",
      );
    }

    run();
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <p className="max-w-sm text-center text-sm text-black/60 dark:text-white/60">
        {error ?? "Signing you in…"}
      </p>
    </main>
  );
}
