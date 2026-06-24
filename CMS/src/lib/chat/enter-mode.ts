/**
 * ai-widget-ux — pure logic for the chat input's Enter-key behaviour.
 *
 * Two modes:
 *  - "send"    (default, legacy): Enter sends, Shift+Enter inserts a newline.
 *  - "newline": Enter inserts a newline, Cmd/Ctrl+Enter sends.
 *
 * `decideSendOnEnter` answers a single keydown: should this Enter SEND the
 * message? (false → let the textarea insert a newline as normal.)
 */

export type EnterMode = "send" | "newline";

export interface KeyMods {
  shift: boolean;
  meta: boolean; // Cmd on macOS
  ctrl: boolean;
}

/** True if this Enter press should send; false → newline (default textarea behaviour). */
export function decideSendOnEnter(mode: EnterMode, mods: KeyMods): boolean {
  if (mode === "newline") {
    // Only Cmd/Ctrl+Enter sends.
    return mods.meta || mods.ctrl;
  }
  // "send" mode: Enter sends unless Shift is held (Shift+Enter = newline).
  return !mods.shift;
}

const KEY = "bizbee.chat.enterMode";

export function loadEnterMode(): EnterMode {
  try {
    return localStorage.getItem(KEY) === "newline" ? "newline" : "send";
  } catch {
    return "send";
  }
}

export function saveEnterMode(mode: EnterMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode / no storage — pref just won't persist */
  }
}
