// The device matrix every QA round runs against. Viewports are CSS pixels.
//
// Safe areas: Chromium can emulate env(safe-area-inset-*) through the
// DevTools protocol, WebKit can't — which is why Chromium is the default
// engine for audits even though the phones are iPhones. Use --engine=webkit
// to cross-check rendering in Safari's engine (no safe areas there).
//
// What NO emulator can do: show a real on-screen keyboard (numeric keypad
// vs. full keyboard heights, visualViewport behavior) or iOS Safari's
// collapsing toolbars. Those checks run on a physical phone — see
// `node cli.mjs up --lan` in the README.

// keyboard: modeled on-screen keyboard heights in CSS px, including the 44px
// form accessory bar (up/down/Done) iOS shows above it. `text` is the full
// keyboard with the predictive row, `decimal` the numeric keypad
// (inputmode="decimal"). Approximate (±20px across iOS versions); used by
// tests/keyboard.spec.mjs, which overlays a keyboard of this height and
// reports it through a stand-in window.visualViewport.

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

export const DEVICES = {
  small: {
    label: "Small phone, 375 wide (iPhone SE 3rd gen, installed PWA)",
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    safeArea: { top: 20, right: 0, bottom: 0, left: 0 },
    keyboard: { text: 304, decimal: 260 },
  },
  short: {
    label: "Short viewport (iPhone SE in Safari, toolbars showing)",
    viewport: { width: 375, height: 548 },
    deviceScaleFactor: 2,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    keyboard: { text: 250, decimal: 206 }, // Safari's bottom toolbar (~54px) collapses under the keyboard
  },
  large: {
    label: "Large modern phone (iPhone Pro Max class, installed PWA)",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
    keyboard: { text: 380, decimal: 335 },
  },
  landscape: {
    label: "Landscape (large phone rotated, installed PWA)",
    viewport: { width: 932, height: 430 },
    deviceScaleFactor: 3,
    safeArea: { top: 0, right: 59, bottom: 21, left: 59 },
    keyboard: { text: 253, decimal: 253 },
  },
};

export function contextOptions(deviceName) {
  const d = DEVICES[deviceName];
  if (!d) throw new Error(`Unknown device "${deviceName}". Choose one of: ${Object.keys(DEVICES).join(", ")}`);
  return {
    viewport: d.viewport,
    deviceScaleFactor: d.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: IOS_SAFARI_UA,
    locale: "en-US",
    timezoneId: "America/New_York",
  };
}

// Chromium only. Returns false (and the caller notes it) where unsupported.
export async function applySafeArea(page, deviceName) {
  const { top, right, bottom, left } = DEVICES[deviceName].safeArea;
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top, topMax: top, right, rightMax: right, bottom, bottomMax: bottom, left, leftMax: left },
    });
    return true;
  } catch {
    return false;
  }
}
