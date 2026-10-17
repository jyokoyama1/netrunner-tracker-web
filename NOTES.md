# Netrunner Tracker (web app / iPhone PWA) — Jeffery, Oct 17, 2026

Replaces Android: Netrunner tokens. A fresh web app (not a port of the GBA look); the GBA project in
`/workspace/handover/gba-netrunner-tracker` is left untouched.

- Live: https://jyokoyama1.github.io/netrunner-tracker-web/
- Repo: https://github.com/jyokoyama1/netrunner-tracker-web (public, GitHub Pages from `main` /root)
- Install on iPhone: open the link in Safari → Share → Add to Home Screen. Runs full screen and offline.

## Features
- Modes, picked on the welcome screen and at New game, switchable any time in the Menu (switching keeps the game and is undoable):
  **Both sides** (Corp panel on top, Runner below, one phone) or **Corp only** / **Runner only** (each player on their own phone).
- Counters per side: Clicks (big number + pips), Credits (start 5), Agenda points, and an ID ability Ready/Used toggle.
  Corp also has Bad publicity; Runner has Tags and Brain damage. Turn number in the top bar.
- Both sides: End turn hands over. The side ending drops to 0 clicks, the side starting gets Corp 3 / Runner 4.
  The turn number goes up when the Corp starts (turn = Corp turn + Runner turn). Top bar shows whose turn it is; the active panel glows.
- Single side: End turn resets your clicks (3 or 4), adds one to the turn number.
- Every End turn makes both ID abilities Ready again ("once per turn" counts on either player's turn).
- 7+ agenda points: the top bar shows "Corp wins!" / "Runner wins!", the tile turns gold, a toast pops. No lock; keep tracking if you like.
- Undo: 50 steps, toast names what was undone. Undo history is saved too. New game, End turn and mode switches are undoable.
- Hold + or − to repeat (after 0.42 s, faster after ~1.3 s); a whole hold is one undo step.
- Menu: tracking mode, "ID ability toggle" on/off, "Corp faces across the table" (face-to-face, both-sides mode only, see below), New game, Help. Help (?) button in the top bar; the help shows by itself on first launch (with the mode picker).
- Limits: credits 0–999, clicks 0–9 (pips grow past the base for extra clicks), others 0–99. A change that hits a limit adds no undo step.

## Face-to-face mode (v1.1, Oct 17 2026, Jeffery's request)
- Physical top to bottom: Corp bar (End Corp turn + Undo, rotated 180°) · Corp panel (rotated 180°) · turn strip (Turn n, whose turn, ?, menu) ·
  Runner panel · Runner bar (Undo + End Runner turn). The top bar moves into the middle so both players can reach it.
- Each End turn button ends only its own side's turn. The active side's is lit (accent gradient), the other is greyed out ("idle");
  tapping an idle one shows a short note and does nothing. Corp Undo shares the one undo history with the Runner Undo.
- The End turn confirm opens oriented for whoever tapped: from the Corp bar the whole sheet is rotated 180° and slides in from the
  physical top (padded for the top safe area); toasts from Corp-bar actions are flipped and shown near the top too.
- Slightly tighter tiles and 48pt bars in this mode so it fits 390x844 with safe areas (tested 0/0, 47/34, 59/34); every target stays ≥44pt.
- Not flipped: layout is the same as v1.0.
- Implementation: `.app.f2f`, `#corpBar`, `#topbar` moved into `#board` between the panels (moved back out before every board rebuild),
  `.overlay.flipped`, `.toast.flipped`, `.end-btn.idle`.

## Icons: Null Signal Games assets (v1.2, Oct 17 2026, from Jeffery's zip "NSG Visual Assets v1.5")
License CC BY-ND 4.0: attribution required (in Help, Menu, README, `assets/nsg/ATTRIBUTION.md`), recolouring OK, no remixing.
So the SVGs are copied unmodified and tinted at display time with CSS masks (`.ico-*`, `.pip i`); HB and Jinteki embed rasters
(3.9 MB / 343 KB) and were rendered to 120 px PNGs (12-15 KB). All 18 files are in the service-worker cache (~100 KB total).
- NSG_CLICK → click pips (available) + help icon; NSG_CLICK_SPENT → spent click pips.
- NSG_CREDIT → glyph next to the big credits number. NSG_AGENDA, NSG_BAD_PUBLICITY, NSG_TAG, NSG_CORE_DAMAGE, NSG_RECURRING_CREDIT → counter labels.
- Faction glyphs → optional "Corp faction" / "Runner faction" in the Menu (picker sheet; default None = plain built-in icon), shown next to
  the side name. Apex is black artwork → mask in Runner colour; the others keep their own colours.
- Kept inline SVG: ID ability, plus/minus, undo, end turn, help, menu, new game, share, trophy, plain Corp/Runner marks.
- Not used: 5 credits, advancement counters, Archives/HQ/R&D, interrupt, link, MU, rez cost, subroutine, trash, virus, generic counters
  (not tracked), set symbols (not relevant), NSG_CLICK_BLUE (fixed blue; we tint NSG_CLICK instead), NSG_BAD_PUBLICITY_SPENT (no spent state).

## Runner damage name (v1.2)
Menu → "Runner damage name": Core damage (default, newer name) / Brain damage. Saved in `settings.damage`. The stored counter key stays
`brain`. Tile label, button labels, help text and undo messages all use the chosen name (stored undo labels are rewritten when shown).

## v1.3 (Oct 17 2026)
- **Recurring credits removed** (counters, editor, refill on End turn, help, tests, `NSG_RECURRING_CREDIT.svg` and its cache entry).
  `migrate()` in app.js drops `rec`/`recMax` from saved state and undo snapshots and fills any missing counters, so 1.0-1.2 saves
  load with or without them (the upgraded save is written back once).
- Layout rebalanced: both sides now has Corp 2 tile rows (Clicks/Credits, Agenda/Bad publicity) and Runner 3
  (Clicks/Credits, Agenda/Tags, Core damage full width). Panels split the height by rows (flex 5:7), every tile row has the same height,
  and steppers are centred in their tiles. In one-side mode the hero tiles take the freed space.
- **Opponent counters in one-side modes** (Menu, only shown in the relevant mode, off by default, saved as `settings.oppTags` / `oppBad`):
  Corp only → "Show Runner tags"; Runner only → "Show Corp bad publicity". The tile is labelled "Runner tags" / "Corp bad publicity",
  uses the opponent's colour (icon + dashed border), and stores the value in the opponent's state (`runner.tags` / `corp.bad`),
  so undo, saving and switching to both sides all just work. End turn doesn't touch it.
- **Face-to-face is the default for both sides** (first launch and New game). `settings.faceChosen` records that the user has used the
  Menu toggle, and from then on their choice is kept, including through New game. Old saves don't record that, so a save with
  face-to-face on stays on (it was off by default, so the user turned it on), and one with it off switches on once.

## Tap-leak rule (the GBA bug, solved for touch)
- Dialogs are bottom sheets over a full-screen backdrop that swallows pointer events; actions fire on `click`.
- A counter only reacts to a press whose pointerdown started on that button while no dialog was open and outside the lockout.
- Closing any dialog locks the main screen for 450 ms, and the overlay keeps catching taps while it fades out.
- Sheet buttons ignore taps in the first 250 ms after opening, so a double tap on End turn opens the confirm but can't confirm it.
- Verified: backdrop tap/hold over a + button, confirm tap/hold, Cancel over Undo, double tap on End turn, New game confirm,
  and in face-to-face: flipped confirm over the Corp bar, flipped Cancel over Corp Undo, double tap on Corp End turn (see tests).

## Files
`index.html` (markup + inline SVG icon sprite), `styles.css`, `app.js` (all logic), `sw.js` (offline cache), `manifest.webmanifest`,
`icons/` (apple-touch-icon 180, 192, 512, maskable 512, favicon.svg; PNGs rendered from the SVG with headless Chrome),
`tests/verify.py` (168 Playwright checks), `tests/shots.py` (screenshots into `screenshots/`).
No build step, no dependencies, no external fonts (system font: SF Pro on iPhone).

## Saving
localStorage key `nrtracker.v1`: `{v, state, undo:[{s,label}], settings:{showId, faceToFace, faceChosen, damage, faction:{corp, runner}, oppTags, oppBad}, helpSeen}`. Written after every change.
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
