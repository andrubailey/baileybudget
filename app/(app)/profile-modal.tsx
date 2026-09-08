"use client";

import { useState } from "react";
import { updateMyProfile } from "@/app/actions";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";

// Opened by clicking the profile chip at the bottom of the sidebar — display
// name and avatar image are the only per-person settings this app has, so a
// quick modal beats a dedicated page nobody would otherwise visit.
export function ProfileModal({
  userEmail,
  displayName,
  avatarUrl,
  onClose,
}: {
  userEmail: string;
  displayName: string | null;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const [avatarPreview, setAvatarPreview] = useState(avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await updateMyProfile(formData);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save profile.");
      return;
    }
    showToast("Profile updated");
    onClose();
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-panel w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-modal"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Profile settings</h2>
            <p className="mt-0.5 text-sm text-text-muted">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-bg hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a local/known-domain asset
              <img
                src={avatarPreview}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
                onError={() => setAvatarPreview("")}
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
                {(displayName || userEmail).trim()[0]?.toUpperCase() ?? "?"}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-sm font-medium text-text">Image URL</label>
              <input
                name="avatar_url"
                type="url"
                defaultValue={avatarUrl ?? ""}
                onChange={(e) => setAvatarPreview(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Display name</label>
            <input
              name="display_name"
              defaultValue={displayName ?? ""}
              placeholder={userEmail.split("@")[0]}
              maxLength={60}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
