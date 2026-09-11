"use client";

import { useRef, useState } from "react";
import { updateMyProfile, uploadAvatar } from "@/app/actions";
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
  // avatarPreview drives the image shown (can briefly be a local blob: URL
  // while an upload is in flight); avatarUrlValue is the actual form field,
  // which only ever holds a real URL — so pasting/saving never submits a
  // blob: URL that would be meaningless outside this tab.
  const [avatarPreview, setAvatarPreview] = useState(avatarUrl ?? "");
  const [avatarUrlValue, setAvatarUrlValue] = useState(avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }

    setError(null);
    setUploading(true);
    // Optimistic local preview while the upload is in flight.
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);

    const fd = new FormData();
    fd.set("avatar_file", file);
    const result = await uploadAvatar(fd);
    setUploading(false);
    URL.revokeObjectURL(objectUrl);

    if (!result.ok || !result.url) {
      setAvatarPreview(avatarUrlValue);
      setError(result.error ?? "Couldn't upload photo.");
      return;
    }
    setAvatarPreview(result.url);
    setAvatarUrlValue(result.url);
    showToast("Photo updated");
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // dvh (not vh) so this actually shrinks when the on-screen keyboard
        // opens, and overflow-y-auto so there's somewhere for the content
        // to go instead of just running off-screen with Save unreachable.
        className="animate-modal-panel max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Profile settings</h2>
            <p className="mt-0.5 text-sm text-text-muted">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="group relative size-14 shrink-0 overflow-hidden rounded-full disabled:opacity-70"
              aria-label="Change profile photo"
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a local/known-domain asset
                <img
                  src={avatarPreview}
                  alt=""
                  className="size-14 rounded-full object-cover"
                  onError={() => setAvatarPreview("")}
                />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
                  {(displayName || userEmail).trim()[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? "…" : "Change"}
              </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-sm font-medium text-text">Photo</label>
              <p className="text-xs text-text-faint">
                Click the circle to upload a photo, or paste an image URL below.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Image URL</label>
            <input
              name="avatar_url"
              type="url"
              value={avatarUrlValue}
              onChange={(e) => {
                setAvatarUrlValue(e.target.value);
                setAvatarPreview(e.target.value);
              }}
              placeholder="https://…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
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

          {/* Sticky, not just the last item — stays reachable at the
              bottom of the scrollable panel instead of scrolling away
              under the keyboard along with the rest of the form. */}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t border-border bg-surface px-5 py-4">
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
