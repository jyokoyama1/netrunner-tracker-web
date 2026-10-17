# Netrunner Tracker (web app / iPhone PWA) — Jeffery, Oct 17, 2026

Replaces Android: Netrunner tokens. A fresh web app (not a port of the GBA look); the GBA project in
`/workspace/handover/gba-netrunner-tracker` is left untouched.

- Live: https://jyokoyama1.github.io/netrunner-tracker-web/
- Repo: https://github.com/jyokoyama1/netrunner-tracker-web (public, GitHub Pages from `main` /root)
- Install on iPhone: open the link in Safari → Share → Add to Home Screen. Runs full screen and offline.

## Features
- Modes, picked on the welcome screen and at New game, switchable any time in the Menu (switching keeps the game and is undoable):
  **Both sides** (Corp panel on top, Runner below, one phone) or **Corp only** / **Runner only** (each player on their own phone).
- Counters per side: Clicks (big number + pips), Credits (start 5), Agenda points, Recurring credits, and an ID ability Ready/Used toggle.
  Corp also has Bad publicity; Runner has Tags and Brain damage. Turn number in the top bar.
- Both sides: End turn hands over. The side ending drops to 0 clicks, the side starting gets Corp 3 / Runner 4 and its recurring credits refill.
  The turn number goes up when the Corp starts (turn = Corp turn + Runner turn). Top bar shows whose turn it is; the active panel glows.
- Single side: End turn resets your clicks (3 or 4), adds one to the turn number, refills your recurring credits.
- Every End turn makes both ID abilities Ready again ("once per turn" counts on either player's turn).
- 7+ agenda points: the top bar shows "Corp wins!" / "Runner wins!", the tile turns gold, a toast pops. No lock; keep tracking if you like.
- Undo: 50 steps, toast names what was undone. Undo history is saved too. New game, End turn and mode switches are undoable.
- Hold + or − to repeat (after 0.42 s, faster after ~1.3 s); a whole hold is one undo step.
- Recurring credits: + adds one (and raises the refill amount if it goes past it, i.e. a new card); − spends one.
  Tap the number to open an editor with "Available now" and "Refill each turn" steppers.
- Menu: tracking mode, "ID ability toggle" on/off, "Corp faces across the table" (rotates the Corp panel 180° for face-to-face play,
  both-sides mode only), New game, Help. Help (?) button in the top bar; the help shows by itself on first launch (with the mode picker).
- Limits: credits 0–999, clicks 0–9 (pips grow past the base for extra clicks), others 0–99, recurring 0–20. A change that hits a limit adds no undo step.

## Tap-leak rule (the GBA bug, solved for touch)
- Dialogs are bottom sheets over a full-screen backdrop that swallows pointer events; actions fire on `click`.
- A counter only reacts to a press whose pointerdown started on that button while no dialog was open and outside the lockout.
- Closing any dialog locks the main screen for 450 ms, and the overlay keeps catching taps while it fades out.
- Sheet buttons ignore taps in the first 250 ms after opening, so a double tap on End turn opens the confirm but can't confirm it.
- Verified: backdrop tap/hold over a + button, confirm tap/hold, Cancel over Undo, double tap on End turn, New game confirm (see tests).

## Files
`index.html` (markup + inline SVG icon sprite), `styles.css`, `app.js` (all logic), `sw.js` (offline cache), `manifest.webmanifest`,
`icons/` (apple-touch-icon 180, 192, 512, maskable 512, favicon.svg; PNGs rendered from the SVG with headless Chrome),
`tests/verify.py` (88 Playwright checks), `tests/shots.py` (screenshots into `screenshots/`).
No build step, no dependencies, no external fonts (system font: SF Pro on iPhone).

## Saving
localStorage key `nrtracker.v1`: `{v, state, undo:[{s,label}], settings:{showId, faceToFace}, helpSeen}`. Written after every change.
Bad/corrupt data → fresh game + welcome. Note: iOS keeps home-screen web app storage separate from Safari tabs.

## PWA details
Standalone display, portrait, `viewport-fit=cover` + `env(safe-area-inset-*)`, black-translucent status bar, `user-scalable=no`,
`touch-action: manipulation` (no double-tap zoom), `overscroll-behavior: none` + fixed body + touchmove guard (no pull-to-refresh/bounce),
gesture events blocked (no pinch). Service worker: cache-first with background refresh, so an update shows on the launch after next.
**When shipping changes, bump `CACHE` in `sw.js` (and `VERSION` in app.js).**

## Test
    python3 -m http.server 8765 &        # from this folder
    python3 tests/verify.py              # or: python3 tests/verify.py https://jyokoyama1.github.io/netrunner-tracker-web/
    python3 tests/shots.py               # screenshots
Uses Playwright with /usr/bin/google-chrome (the bundled Playwright browser isn't installed), 390x844, touch events via CDP.

## Ideas not done yet
Hand size / memory units, opponent's agenda score in single-side mode, a game log, haptics (iOS Safari has no vibrate API).
