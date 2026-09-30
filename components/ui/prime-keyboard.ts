// iOS Safari only raises the on-screen keyboard when focus() happens inside
// the tap's own event handler. A sheet that mounts and focuses its field a
// render later is too late — the field focuses, but no keyboard appears.
// Calling this synchronously in the tap handler focuses a hidden input so
// the keyboard comes up immediately; when the real field takes focus, iOS
// keeps the keyboard open and switches it to that field's inputMode.
export function primeKeyboard(inputMode: "decimal" | "numeric" | "text" = "text") {
  if (typeof document === "undefined") return;
  const input = document.createElement("input");
  input.setAttribute("inputmode", inputMode);
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  // 16px keeps iOS from zooming the page on focus.
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none;";
  document.body.appendChild(input);
  input.focus({ preventScroll: true });
  const remove = () => input.remove();
  input.addEventListener("blur", remove, { once: true });
  // If nothing takes over focus, don't leave a stray keyboard up.
  setTimeout(() => {
    if (document.activeElement === input) input.blur();
    remove();
  }, 1000);
}
