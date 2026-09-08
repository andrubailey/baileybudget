"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/app/(app)/logo-mark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="animate-fade-in-up w-full max-w-sm space-y-5 rounded-xl border border-border bg-surface p-8 shadow-card"
      >
        <div>
          <LogoMark size={40} />
          <h1 className="mt-3 text-xl font-semibold text-text">Bailey Budget</h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign in to view your shared budget.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-text">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-text">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>

        {error && <p className="text-sm text-negative">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
