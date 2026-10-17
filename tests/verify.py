"""End-to-end checks in headless Chrome at 390x844 (iPhone-like, touch).
Usage: python3 tests/verify.py [base_url]   (default http://localhost:8765/)"""
import sys, json, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
CHROME = '/usr/bin/google-chrome'
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info and not cond else ''))

def S(pg): return pg.evaluate('window.__nrt.state')
def U(pg): return pg.evaluate('window.__nrt.undoCount')
def sheet_open(pg): return pg.evaluate("!document.getElementById('overlay').hidden && document.getElementById('overlay').classList.contains('open')")
def center(pg, sel):
    loc = pg.locator(sel).first
    if loc.evaluate("e => !!e.closest('.sheet')"): loc.scroll_into_view_if_needed(); pg.wait_for_timeout(50)
    b = loc.bounding_box(); return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2

def new_ctx(b):
    return b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME)
    ctx = new_ctx(br); pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    cdp = ctx.new_cdp_session(pg)
    def touch(x, y, hold_ms=0):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        if hold_ms: pg.wait_for_timeout(hold_ms)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    def tap(sel, n=1, gap=40):
        for _ in range(n):
            x, y = center(pg, sel); touch(x, y); pg.wait_for_timeout(gap)
    def step(side, key, d): return f'.panel [data-side="{side}"][data-key="{key}"][data-d="{d}"]'
    def rest(): pg.wait_for_timeout(600)  # past sheet animation + input lockout
    def face_off():
        tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="face"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    def f2f_on(): return pg.locator('#corpBar').is_visible() and pg.locator('.panel.corp.flipped').count() == 1

    pg.goto(BASE); pg.wait_for_timeout(800)
    # ---- first run
    check('welcome/help sheet shows on first run', sheet_open(pg) and pg.locator('#sheet[data-kind="welcome"]').count() == 1)
    pg.locator('[data-act="backdrop"]').click(position={'x': 20, 'y': 20}, force=True); pg.wait_for_timeout(400)
    check('welcome cannot be dismissed by backdrop (must pick a mode)', sheet_open(pg))
    tap('.choice[data-mode="both"]'); tap('[data-act="start"]'); rest()
    check('first launch, both sides: face-to-face is on by default', f2f_on())
    face_off()
    check('turning face-to-face off in the Menu works and is saved as the user\'s choice', not f2f_on()
          and pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('nrtracker.v1')).settings;return s.faceToFace===false&&s.faceChosen===true})()"))
    st = S(pg)
    check('new game both sides: turn 1, Corp active, Corp 3 clicks, Runner 0, 5 credits each',
          st['mode'] == 'both' and st['turn'] == 1 and st['active'] == 'corp' and st['corp']['clicks'] == 3
          and st['runner']['clicks'] == 0 and st['corp']['credits'] == 5 and st['runner']['credits'] == 5, st)
    check('both panels visible', pg.locator('.panel.corp').count() == 1 and pg.locator('.panel.runner').count() == 1)
    check('no undo history at start', U(pg) == 0)

    # ---- layout
    sizes = pg.evaluate("""[...document.querySelectorAll('.step, .icon-btn, .undo-btn, .end-btn')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [r.width,r.height]})""")
    check('every +/- and bar button is at least 44x44', all(w >= 44 and h >= 44 for w, h in sizes), sizes[:4])
    idh = pg.evaluate("""(()=>{const b=document.querySelector('.id-toggle');const r=b.getBoundingClientRect();return r.height})()""")
    check('ID toggle visible (34pt pill + 46pt hit area)', idh >= 34, idh)
    check('no horizontal overflow', pg.evaluate('document.documentElement.scrollWidth <= 390'))
    check('both-sides layout fits 390x844 without scrolling', pg.evaluate("(()=>{const b=document.getElementById('board');return b.scrollHeight<=b.clientHeight+1})()"))
    pg.evaluate("document.documentElement.style.setProperty('--safe-t','47px');document.documentElement.style.setProperty('--safe-b','34px')")
    pg.wait_for_timeout(100)
    fit = pg.evaluate("(()=>{const b=document.getElementById('board');return [b.scrollHeight,b.clientHeight]})()")
    check('both-sides layout fits with iPhone safe areas (47 top / 34 bottom)', fit[0] <= fit[1] + 1, fit)
    pg.evaluate("document.documentElement.style.removeProperty('--safe-t');document.documentElement.style.removeProperty('--safe-b')")
    labels = pg.locator('.tile-label span').all_inner_texts()
    check('plain-word labels', set(['Clicks', 'Credits', 'Agenda points', 'Bad publicity', 'Tags', 'Core damage']) <= set(labels), labels)

    # ---- counters
    tap(step('corp', 'credits', 1), 3); tap(step('corp', 'credits', -1))
    check('Corp credits + x3, - x1 = 7', S(pg)['corp']['credits'] == 7, S(pg)['corp'])
    check('shown number matches', pg.inner_text('[data-num="corp-credits"]') == '7')
    for side, key in [('corp', 'agenda'), ('corp', 'bad'), ('runner', 'agenda'), ('runner', 'tags'), ('runner', 'brain'), ('runner', 'credits')]:
        before = S(pg)[side][key]; tap(step(side, key, 1)); tap(step(side, key, 1)); tap(step(side, key, -1))
        check(f'{side} {key} +2 -1', S(pg)[side][key] == before + 1, S(pg)[side])
    tap(step('corp', 'clicks', -1))
    check('spend a Corp click (3 -> 2) and pips follow', S(pg)['corp']['clicks'] == 2 and pg.locator('.panel.corp .pip.on').count() == 2)
    tap(step('corp', 'clicks', 1), 2)
    check('extra click beyond 3 adds a pip', S(pg)['corp']['clicks'] == 4 and pg.locator('.panel.corp .pip').count() == 4)
    tap(step('corp', 'clicks', -1))
    u = U(pg); tap(step('runner', 'brain', -1)); tap(step('runner', 'brain', -1))
    check('minus at 0 stays 0 and adds no undo step', S(pg)['runner']['brain'] == 0 and U(pg) == u + 1, (S(pg)['runner'], U(pg), u))
    # ID ability
    tap('.id-toggle[data-id="corp"]')
    check('Corp ID ability marked used', S(pg)['corp']['idUsed'] is True and pg.inner_text('.id-toggle[data-id="corp"] .id-state') == 'Used')
    # hold to repeat
    u = U(pg); c0 = S(pg)['runner']['credits']
    x, y = center(pg, step('runner', 'credits', 1)); touch(x, y, 1500); pg.wait_for_timeout(200)
    c1 = S(pg)['runner']['credits']
    check('holding + repeats (1.5 s hold adds several credits)', c1 - c0 >= 5, (c0, c1))
    check('a whole hold is one undo step', U(pg) == u + 1, (u, U(pg)))
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('undo of hold restores credits', S(pg)['runner']['credits'] == c0)

    # ---- undo
    snap = S(pg); u = U(pg)
    tap(step('corp', 'credits', 1)); tap(step('runner', 'tags', 1)); tap(step('corp', 'agenda', 1))
    tap('#undoBtn', 3, 80)
    check('3 changes then 3 undos returns exact state', S(pg) == snap and U(pg) == u, (U(pg), u))
    check('undo toast names the change', 'Undone:' in pg.inner_text('#toast'))
    for i in range(60): tap(step('corp', 'credits', 1 if i % 2 == 0 else -1), 1, 5)
    check('undo history capped at 50 steps (>= 32)', U(pg) == 50, U(pg))

    # ---- end turn (both)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    tap('[data-act="start"]'); rest()
    face_off()
    tap(step('corp', 'clicks', -1), 3); tap('.id-toggle[data-id="runner"]'); tap('.id-toggle[data-id="corp"]')
    tap('#endBtn'); pg.wait_for_timeout(500)
    check('End turn asks first', sheet_open(pg) and pg.locator('#sheet[data-kind="endturn"]').count() == 1)
    check('confirm text names the next side', 'Runner starts turn 1 with 4 clicks' in pg.inner_text('#sheet'), pg.inner_text('#sheet'))
    before = S(pg); tap('#sheet [data-act="cancel"]'); rest()
    check('Cancel keeps everything', S(pg) == before and not sheet_open(pg))
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    st = S(pg)
    check('Corp -> Runner: Runner 4 clicks, Corp 0, still turn 1', st['active'] == 'runner' and st['runner']['clicks'] == 4 and st['corp']['clicks'] == 0 and st['turn'] == 1, st)
    check('no recurring credits anywhere in the state', all('rec' not in st[sd] and 'recMax' not in st[sd] for sd in ('corp', 'runner')), st)
    check('no recurring credits counters on screen', pg.locator('[data-key="rec"], [data-tile$="-rec"]').count() == 0 and 'ecurring' not in pg.inner_text('#board'))
    check('ID abilities reset for both sides', not st['corp']['idUsed'] and not st['runner']['idUsed'])
    check('End button now says End Runner turn', pg.inner_text('#endLabel') == 'End Runner turn')
    check('Runner panel highlighted', pg.locator('.panel.runner.active').count() == 1 and pg.locator('.panel.corp.active').count() == 0)
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    st = S(pg)
    check('Runner -> Corp: turn 2, Corp 3 clicks, Runner 0', st['turn'] == 2 and st['active'] == 'corp' and st['corp']['clicks'] == 3 and st['runner']['clicks'] == 0, st)
    check('turn number shown', pg.inner_text('#turnNum') == '2')
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('end turn can be undone', S(pg)['turn'] == 1 and S(pg)['active'] == 'runner')
    pg.wait_for_timeout(500)

    # ---- confirm-tap leak
    def leak_case(name, open_sel, act_sel, hold=0):
        tap(open_sel); pg.wait_for_timeout(500)
        before = S(pg); u0 = U(pg)
        x, y = center(pg, act_sel)
        touch(x, y, hold)
        pg.wait_for_timeout(30)
        touch(x, y)                    # immediate second tap at same spot (lands on what is underneath)
        pg.wait_for_timeout(250)
        return before, u0, (x, y)
    # 1. Backdrop tap over a counter: closes the sheet, counter untouched
    tap('#endBtn'); pg.wait_for_timeout(500)
    before = S(pg); u0 = U(pg)
    x, y = center(pg, step('corp', 'credits', 1))
    check('(setup) Corp credits + button lies under the dialog backdrop', y < pg.locator('#sheet').bounding_box()['y'])
    touch(x, y); pg.wait_for_timeout(40); touch(x, y); pg.wait_for_timeout(60); touch(x, y); pg.wait_for_timeout(300)
    check('leak: backdrop tap + 2 fast follow-up taps on a + do not change it', S(pg) == before and U(pg) == u0 and not sheet_open(pg), (S(pg)['corp'], before['corp']))
    pg.wait_for_timeout(500); touch(x, y); pg.wait_for_timeout(100)
    check('leak: the same + works again after the short lockout', S(pg)['corp']['credits'] == before['corp']['credits'] + 1)
    tap('#undoBtn'); pg.wait_for_timeout(500)
    # 2. Backdrop held 1.5 s over a counter
    tap('#endBtn'); pg.wait_for_timeout(500); before = S(pg); u0 = U(pg)
    touch(x, y, 1500); pg.wait_for_timeout(300)
    check('leak: backdrop held 1.5 s over + does not repeat into the counter', S(pg) == before and U(pg) == u0)
    pg.wait_for_timeout(500)
    # 3. Confirm End turn: tap + immediate second tap at the same spot (End turn button underneath)
    before, u0, _ = leak_case('confirm', '#endBtn', '#sheet [data-act="confirm"]')
    st = S(pg)
    check('leak: confirm ends exactly one turn and the follow-up tap does not reopen it or touch anything',
          st['active'] != before['active'] and U(pg) == u0 + 1 and not sheet_open(pg), (st['active'], U(pg), u0, sheet_open(pg)))
    pg.wait_for_timeout(500)
    # 4. Confirm End turn with the finger held 1.5 s
    before, u0, _ = leak_case('confirm-held', '#endBtn', '#sheet [data-act="confirm"]', hold=1500)
    check('leak: held confirm still one turn, nothing else changed', U(pg) == u0 + 1 and S(pg)['active'] != before['active'] and not sheet_open(pg))
    pg.wait_for_timeout(500)
    # 5. Cancel sits over Undo: a quick double tap must not undo anything
    before, u0, _ = leak_case('cancel', '#endBtn', '#sheet [data-act="cancel"]')
    check('leak: Cancel + fast second tap does not hit Undo underneath', S(pg) == before and U(pg) == u0 and not sheet_open(pg))
    pg.wait_for_timeout(500)
    # 6. Double tap on End turn must not confirm the sheet that appears under the finger
    x, y = center(pg, '#endBtn'); before = S(pg)
    touch(x, y); pg.wait_for_timeout(60); touch(x, y); pg.wait_for_timeout(300)
    check('leak: double tap on End turn opens the confirm but does not confirm it', sheet_open(pg) and S(pg) == before)
    tap('#sheet [data-act="cancel"]'); rest()
    # 7. New game confirm
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="newgame"]'); pg.wait_for_timeout(500)
    check('New game asks first', pg.locator('#sheet[data-kind="newgame"]').count() == 1)
    x, y = center(pg, '#sheet [data-act="confirm"]'); u0 = U(pg)
    touch(x, y); pg.wait_for_timeout(30); touch(x, y); pg.wait_for_timeout(300)
    st = S(pg)
    check('leak: New game confirm + fast second tap: fresh game, nothing else', st['turn'] == 1 and st['corp']['credits'] == 5 and st['active'] == 'corp' and U(pg) == u0 + 1 and not sheet_open(pg), (st, U(pg), u0))
    tap('#undoBtn') if False else None
    pg.wait_for_timeout(500)
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('new game can be undone', S(pg)['turn'] != 1 or S(pg)['active'] != 'corp' or S(pg)['corp']['credits'] != 5)
    pg.wait_for_timeout(300)

    # ---- win notice
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700); tap('[data-act="start"]'); rest()
    face_off()
    tap(step('runner', 'agenda', 1), 7, 60); pg.wait_for_timeout(150)
    check('7 agenda points shows a win notice', 'Runner wins' in pg.inner_text('#status') and 'wins' in pg.inner_text('#toast'), pg.inner_text('#status'))
    check('agenda tile highlighted', pg.locator('[data-tile="runner-agenda"].won').count() == 1)
    pg.wait_for_timeout(2700); pg.screenshot(path='screenshots/win.png')
    tap(step('runner', 'agenda', -1)); pg.wait_for_timeout(100)
    check('win notice goes away at 6', 'wins' not in pg.inner_text('#status'))

    # ---- reload persistence
    tap(step('corp', 'credits', 1), 4); tap(step('runner', 'tags', 1), 2); tap('.id-toggle[data-id="runner"]')
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    tap(step('runner', 'credits', -1))
    before = S(pg); u0 = U(pg)
    pg.reload(); pg.wait_for_timeout(800)
    check('state survives reload', S(pg) == before, (S(pg), before))
    check('undo history survives reload', U(pg) == u0)
    check('welcome does not show again after reload', not sheet_open(pg))
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('undo works after reload', S(pg)['runner']['credits'] == before['runner']['credits'] + 1)

    # ---- single-side modes
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="newgame"]'); pg.wait_for_timeout(500)
    tap('#sheet .choice[data-mode="runner"]', 1, 100); tap('#sheet [data-act="confirm"]'); rest()
    st = S(pg)
    check('new game Runner only: one Runner panel, 4 clicks', st['mode'] == 'runner' and st['runner']['clicks'] == 4
          and pg.locator('.panel').count() == 1 and pg.locator('.panel.runner').count() == 1, st)
    check('single-side layout fits without scrolling', pg.evaluate("(()=>{const b=document.getElementById('board');return b.scrollHeight<=b.clientHeight+1})()"))
    sizes = pg.evaluate("""[...document.querySelectorAll('.step')].map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})""")
    check('single-side +/- buttons are 52pt or bigger', min(sizes) >= 52, min(sizes))
    tap(step('runner', 'clicks', -1), 3); tap('.id-toggle[data-id="runner"]')
    tap('#endBtn'); pg.wait_for_timeout(500)
    check('single-side confirm text', 'Turn 2 starts with 4 clicks' in pg.inner_text('#sheet'), pg.inner_text('#sheet'))
    tap('#sheet [data-act="confirm"]'); rest()
    st = S(pg)
    check('single-side End turn: clicks back to 4, turn 2, ID ready', st['runner']['clicks'] == 4 and st['turn'] == 2
          and not st['runner']['idUsed'], st)
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    check('turn counts every turn in single-side mode', S(pg)['turn'] == 3)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .choice[data-mode="corp"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    st = S(pg)
    check('switch to Corp only keeps the game (turn 3) and shows the Corp panel', st['mode'] == 'corp' and st['turn'] == 3 and pg.locator('.panel.corp').count() == 1 and pg.locator('.panel').count() == 1)
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    check('Corp only End turn: 3 clicks', S(pg)['corp']['clicks'] == 3 and S(pg)['turn'] == 4)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .choice[data-mode="both"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    check('switch back to both sides shows two panels', pg.locator('.panel').count() == 2)
    tap('#undoBtn'); pg.wait_for_timeout(200)
    check('mode switch can be undone', S(pg)['mode'] == 'corp')
    pg.reload(); pg.wait_for_timeout(700)
    check('mode survives reload', S(pg)['mode'] == 'corp' and pg.locator('.panel').count() == 1)

    # ---- face-to-face: Corp half + its own End turn / Undo bar turned toward the Corp player
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700); tap('[data-act="start"]'); rest()
    check('fresh game: face-to-face on by default (no Menu step needed)', f2f_on())
    def rot(sel): return pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).transform")
    check('flipped: Corp panel rotated 180°', rot('.panel.corp').startswith('matrix(-1'), rot('.panel.corp'))
    check('flipped: Corp bar visible and rotated 180°', pg.locator('#corpBar').is_visible() and rot('#corpBar').startswith('matrix(-1'), rot('#corpBar'))
    cb = pg.locator('#corpBar').bounding_box(); cp = pg.locator('.panel.corp').bounding_box()
    tb = pg.locator('#topbar').bounding_box(); rp = pg.locator('.panel.runner').bounding_box(); bb = pg.locator('.bottombar').bounding_box()
    check('flipped order top to bottom: Corp bar, Corp panel, turn strip, Runner panel, Runner bar',
          cb['y'] < cp['y'] < tb['y'] < rp['y'] < bb['y'] and cb['y'] < 20, (cb, cp, tb, rp, bb))
    check('flipped: Corp bar has End Corp turn + Undo', pg.inner_text('#corpEndBtn') .strip() == 'End Corp turn' and pg.locator('#corpUndoBtn').is_visible())
    check('flipped: Corp turn -> Corp End turn highlighted, Runner End turn idle',
          'idle' not in pg.get_attribute('#corpEndBtn', 'class') and 'idle' in pg.get_attribute('#endBtn', 'class') and pg.inner_text('#endLabel') == 'End Runner turn')
    sizes = pg.evaluate("""[...document.querySelectorAll('.step, .icon-btn, .undo-btn, .end-btn')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})""")
    check('flipped: every +/- and bar button still at least 44pt', min(sizes) >= 44, min(sizes))
    for sa in [(0, 0), (47, 34), (59, 34)]:
        pg.evaluate(f"document.documentElement.style.setProperty('--safe-t','{sa[0]}px');document.documentElement.style.setProperty('--safe-b','{sa[1]}px')"); pg.wait_for_timeout(100)
        fit = pg.evaluate("(()=>{const b=document.getElementById('board');return [b.scrollHeight,b.clientHeight]})()")
        check(f'flipped layout fits 390x844 with safe areas {sa}', fit[0] <= fit[1] + 1, fit)
    pg.evaluate("document.documentElement.style.setProperty('--safe-t','47px');document.documentElement.style.setProperty('--safe-b','34px')"); pg.wait_for_timeout(100)
    pg.screenshot(path='screenshots/face-to-face.png')
    # Runner's End turn is idle on the Corp turn
    before = S(pg); tap('#endBtn'); pg.wait_for_timeout(400)
    check('flipped: idle Runner End turn does nothing on the Corp turn', not sheet_open(pg) and S(pg) == before)
    pg.wait_for_timeout(1800)
    # Corp ends from its own bar; sheet opens upside down at the physical top
    tap('#corpEndBtn'); pg.wait_for_timeout(500)
    sh = pg.locator('#sheet').bounding_box()
    check('Corp End turn opens the confirm upside down at the top', sheet_open(pg) and pg.evaluate("document.getElementById('overlay').classList.contains('flipped')")
          and sh['y'] < 5 and sh['height'] < 400 and rot('#overlay').startswith('matrix(-1'), (sh, rot('#overlay')))
    pg.screenshot(path='screenshots/face-to-face-corp-confirm.png')
    x, y = center(pg, '#sheet [data-act="confirm"]')
    over = pg.evaluate(f"(()=>{{const o=document.getElementById('overlay');o.style.pointerEvents='none';const e=document.elementFromPoint({x},{y});o.style.pointerEvents='';return e&&e.closest('button')?e.closest('button').id||e.closest('button').className:''}})()")
    check('(setup) flipped confirm sits over the Corp bar', over in ('corpEndBtn', 'corpUndoBtn'), over)
    u0 = U(pg); touch(x, y); pg.wait_for_timeout(30); touch(x, y); pg.wait_for_timeout(300)
    st = S(pg)
    check('leak: flipped confirm + fast second tap ends exactly one Corp turn, nothing underneath fires',
          st['active'] == 'runner' and st['runner']['clicks'] == 4 and U(pg) == u0 + 1 and not sheet_open(pg), (st['active'], U(pg), u0))
    check('Corp toast is upside down near the top', 'flipped' in pg.get_attribute('#toast', 'class'))
    pg.wait_for_timeout(500)
    check('flipped: Runner turn -> Runner End turn highlighted, Corp End turn idle',
          'idle' in pg.get_attribute('#corpEndBtn', 'class') and 'idle' not in pg.get_attribute('#endBtn', 'class'))
    before = S(pg); tap('#corpEndBtn'); pg.wait_for_timeout(400)
    check('flipped: idle Corp End turn does nothing on the Runner turn', not sheet_open(pg) and S(pg) == before)
    pg.wait_for_timeout(1800)
    # Runner confirm is the right way up
    tap('#endBtn'); pg.wait_for_timeout(500)
    check('Runner End turn opens the confirm the right way up at the bottom', sheet_open(pg) and not pg.evaluate("document.getElementById('overlay').classList.contains('flipped')")
          and pg.locator('#sheet').bounding_box()['y'] > 400)
    tap('#sheet [data-act="cancel"]'); rest()
    # Corp cancel over Corp Undo
    tap(step('runner', 'credits', 1)); pg.wait_for_timeout(100)
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()   # back to Corp turn
    tap('#corpEndBtn'); pg.wait_for_timeout(500)
    before = S(pg); u0 = U(pg); x, y = center(pg, '#sheet [data-act="cancel"]')
    touch(x, y); pg.wait_for_timeout(30); touch(x, y); pg.wait_for_timeout(300)
    check('leak: flipped Cancel + fast second tap does not hit Corp Undo underneath', S(pg) == before and U(pg) == u0 and not sheet_open(pg))
    pg.wait_for_timeout(500)
    x, y = center(pg, '#corpEndBtn'); before = S(pg)
    touch(x, y); pg.wait_for_timeout(60); touch(x, y); pg.wait_for_timeout(300)
    check('leak: double tap on Corp End turn opens the confirm but does not confirm it', sheet_open(pg) and S(pg) == before)
    tap('#sheet [data-act="cancel"]'); rest()
    # Corp undo
    tap(step('corp', 'credits', 1), 2); u0 = U(pg); c0 = S(pg)['corp']['credits']
    tap('#corpUndoBtn'); pg.wait_for_timeout(150)
    check('Corp Undo undoes (shared history) and its count matches', S(pg)['corp']['credits'] == c0 - 1 and U(pg) == u0 - 1
          and pg.inner_text('#corpUndoCount') == pg.inner_text('#undoCount') == str(u0 - 1))
    check('Corp counters work while flipped', S(pg)['corp']['credits'] == 6)
    pg.reload(); pg.wait_for_timeout(700)
    check('face-to-face survives reload', pg.locator('#corpBar').is_visible() and rot('.panel.corp').startswith('matrix(-1'))
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="face"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    check('turning it off restores the normal layout', pg.locator('#corpBar').is_hidden() and rot('.panel.corp') == 'none'
          and pg.locator('#topbar').bounding_box()['y'] < pg.locator('.panel.corp').bounding_box()['y']
          and pg.inner_text('#endLabel') == 'End Corp turn' and 'idle' not in pg.get_attribute('#endBtn', 'class'))
    pg.reload(); pg.wait_for_timeout(700)
    check('turned off by the user: stays off after reload', not f2f_on() and pg.locator('.panel').count() == 2)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="newgame"]'); pg.wait_for_timeout(500)
    tap('#sheet .choice[data-mode="both"]', 1, 100); tap('#sheet [data-act="confirm"]'); rest()
    check('turned off by the user: New game (both sides) keeps it off', not f2f_on())
    face_off()
    on1 = f2f_on(); pg.reload(); pg.wait_for_timeout(700)
    check('turned back on by the user: on, and still on after reload', on1 and f2f_on())
    face_off()
    pg.evaluate("document.documentElement.style.removeProperty('--safe-t');document.documentElement.style.removeProperty('--safe-b')")
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .choice[data-mode="corp"]', 1, 300); tap('#sheet [data-act="close"]'); rest()

    # ---- NSG icons, faction marks, damage name
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700); tap('[data-act="start"]'); rest()
    assets = pg.evaluate("""Promise.all(['NSG_CLICK.svg','NSG_CLICK_SPENT.svg','NSG_CREDIT.svg','NSG_AGENDA.svg','NSG_BAD_PUBLICITY.svg','NSG_TAG.svg','NSG_CORE_DAMAGE.svg',
      'factions/NSG_HB.png','factions/NSG_JINTEKI.png','factions/NSG_NBN.svg','factions/NSG_WEYLAND.svg','factions/NSG_ANARCH.svg','factions/NSG_CRIMINAL.svg','factions/NSG_SHAPER.svg','factions/NSG_ADAM.svg','factions/NSG_APEX.svg','factions/NSG_SUNNY.svg']
      .map(f=>fetch('assets/nsg/'+f).then(r=>r.ok)))""")
    check('all 17 NSG assets are served', all(assets), assets)
    masks = pg.evaluate("""['agenda','bad'].map(k=>getComputedStyle(document.querySelector('[data-tile="corp-'+k+'"] .ico')).webkitMaskImage||getComputedStyle(document.querySelector('[data-tile="corp-'+k+'"] .ico')).maskImage)""")
    check('counter labels use the NSG symbols as masks', all('assets/nsg/NSG_' in m for m in masks), masks)
    pm = pg.evaluate("""[...document.querySelectorAll('.panel.corp .pip i')].map(i=>{const s=getComputedStyle(i);return (s.webkitMaskImage||s.maskImage)})""")
    check('click pips are NSG click symbols (3 available)', len(pm) == 3 and all('NSG_CLICK.svg' in m for m in pm), pm)
    tap(step('corp', 'clicks', -1)); pg.wait_for_timeout(100)
    pm = pg.evaluate("""[...document.querySelectorAll('.panel.corp .pip i')].map(i=>{const s=getComputedStyle(i);return (s.webkitMaskImage||s.maskImage)})""")
    check('a spent click shows the crossed-out spent symbol', sum('NSG_CLICK_SPENT' in m for m in pm) == 1, pm)
    check('credits show the NSG credit glyph by the number', pg.locator('[data-tile="corp-credits"] .value .cr-glyph').count() == 1)
    ico_col = pg.evaluate("[getComputedStyle(document.querySelector('[data-tile=\"corp-agenda\"] .ico')).backgroundColor, getComputedStyle(document.querySelector('[data-tile=\"runner-agenda\"] .ico')).backgroundColor]")
    check('icons tinted with each side colour', ico_col[0] != ico_col[1] and 'rgb(47, 208, 255)' in ico_col[0], ico_col)
    # damage name
    check('damage counter defaults to Core damage', 'Core damage' in pg.inner_text('[data-tile="runner-brain"] .tile-label'))
    tap(step('runner', 'brain', 1)); pg.wait_for_timeout(100)
    tap('#menuBtn'); pg.wait_for_timeout(500)
    check('menu has the damage name setting, Core damage selected', pg.locator('#sheet .seg-btn.on[data-v="core"]').count() == 1)
    tap('#sheet .seg-btn[data-v="brain"]', 1, 300)
    check('choosing Brain damage updates the menu', pg.locator('#sheet .seg-btn.on[data-v="brain"]').count() == 1)
    tap('#sheet [data-act="close"]'); rest()
    check('tile label now says Brain damage', 'Brain damage' in pg.inner_text('[data-tile="runner-brain"] .tile-label'))
    check('step buttons say brain damage', 'brain damage' in pg.get_attribute(step('runner', 'brain', 1), 'aria-label'))
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('undo message uses the chosen name (change was made as core damage)', 'Runner brain damage +1' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    tap('#helpBtn'); pg.wait_for_timeout(500)
    ht = pg.inner_text('#sheet')
    check('help text uses the chosen name', 'brain damage' in ht and 'Rename it to Core damage' in ht, ht[:300])
    check('help credits Null Signal Games (CC BY-ND 4.0)', 'Null Signal Games' in ht and 'CC BY-ND 4.0' in ht)
    tap('#sheet [data-act="close"]'); rest()
    pg.reload(); pg.wait_for_timeout(700)
    check('damage name survives reload', 'Brain damage' in pg.inner_text('[data-tile="runner-brain"] .tile-label')
          and pg.evaluate("JSON.parse(localStorage.getItem('nrtracker.v1')).settings.damage") == 'brain')
    tap(step('runner', 'brain', 1)); pg.wait_for_timeout(50)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .seg-btn[data-v="core"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    tap('#undoBtn'); pg.wait_for_timeout(100)
    check('switch back: label and undo message say core damage', 'Core damage' in pg.inner_text('[data-tile="runner-brain"] .tile-label') and 'core damage' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    pg.wait_for_timeout(400)
    # factions
    check('no faction by default: plain side icons', pg.locator('.panel.corp .side-name svg').count() == 1 and pg.locator('.panel .side-mark').count() == 0)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="faction"][data-side="corp"]', 1, 400)
    check('Corp faction picker lists None + 4 Corp factions', pg.locator('#sheet .faction-opt').count() == 5)
    tap('#sheet .faction-opt[data-id="hb"]', 1, 400)
    check('picking returns to the menu showing Haas-Bioroid', pg.locator('#sheet[data-kind="menu"]').count() == 1 and 'Haas-Bioroid' in pg.inner_text('#sheet'))
    tap('#sheet [data-act="faction"][data-side="runner"]', 1, 400)
    check('Runner faction picker lists None + 6 Runner factions', pg.locator('#sheet .faction-opt').count() == 7)
    tap('#sheet .faction-opt[data-id="apex"]', 1, 400); tap('#sheet [data-act="close"]'); rest()
    ok_img = pg.evaluate("(()=>{const i=document.querySelector('.panel.corp img.side-mark');return !!i && i.complete && i.naturalWidth>0})()")
    check('Corp header shows the HB glyph', ok_img)
    check('Runner header shows the Apex glyph tinted (mask)', pg.locator('.panel.runner .side-mark.masked').count() == 1)
    pg.reload(); pg.wait_for_timeout(700)
    check('factions survive reload', pg.locator('.panel.corp img.side-mark').count() == 1 and pg.locator('.panel.runner .side-mark.masked').count() == 1)
    fit = pg.evaluate("(()=>{const b=document.getElementById('board');return b.scrollHeight<=b.clientHeight+1})()")
    check('layout with faction marks still fits', fit)
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="faction"][data-side="runner"]', 1, 400); tap('#sheet .faction-opt[data-id=""]', 1, 400)
    tap('#sheet [data-act="close"]'); rest()
    check('faction can be cleared back to the plain icon', pg.locator('.panel.runner .side-name svg').count() == 1)

    # ---- one-side modes: opponent counters
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    tap('.choice[data-mode="corp"]'); tap('[data-act="start"]'); rest()
    check('Corp only: no Runner tags counter by default', pg.locator('[data-tile="runner-tags"]').count() == 0)
    tap('#menuBtn'); pg.wait_for_timeout(500)
    check('Corp only menu offers "Show Runner tags" (off) and not the bad publicity option',
          pg.locator('#sheet [data-k="oppTags"]').count() == 1 and pg.locator('#sheet [data-k="oppTags"] .switch.on').count() == 0
          and pg.locator('#sheet [data-k="oppBad"]').count() == 0 and pg.locator('#sheet [data-act="face"]').count() == 0)
    tap('#sheet [data-k="oppTags"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    t = pg.locator('[data-tile="runner-tags"]')
    check('Runner tags counter appears in the Corp panel', t.count() == 1 and pg.locator('.panel.corp [data-tile="runner-tags"]').count() == 1
          and 'Runner tags' in t.inner_text())
    col = pg.evaluate("getComputedStyle(document.querySelector('[data-tile=\"runner-tags\"] .ico')).backgroundColor")
    check('Runner tags icon is the NSG tag in the Runner colour', col == 'rgb(255, 61, 120)' and 'NSG_TAG' in pg.evaluate("getComputedStyle(document.querySelector('[data-tile=\"runner-tags\"] .ico')).webkitMaskImage"), col)
    tap(step('runner', 'tags', 1), 2); tap(step('runner', 'tags', -1)); pg.wait_for_timeout(100)
    check('Runner tags +2 -1 = 1 (stored as the Runner\'s tags)', S(pg)['runner']['tags'] == 1 and pg.inner_text('[data-num="runner-tags"]') == '1')
    tap('#undoBtn'); pg.wait_for_timeout(150)
    check('undo works on Runner tags and names it', S(pg)['runner']['tags'] == 2 and 'Runner tags' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    pg.wait_for_timeout(300)
    check('one-side layout with the extra counter fits', pg.evaluate("(()=>{const b=document.getElementById('board');return b.scrollHeight<=b.clientHeight+1})()"))
    tap('#endBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="confirm"]'); rest()
    check('End turn leaves Runner tags alone', S(pg)['runner']['tags'] == 2 and S(pg)['corp']['clicks'] == 3)
    pg.reload(); pg.wait_for_timeout(700)
    check('Runner tags toggle and value survive reload', pg.locator('[data-tile="runner-tags"]').count() == 1 and pg.inner_text('[data-num="runner-tags"]') == '2')
    pg.screenshot(path='screenshots/corp-only-runner-tags.png')
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .choice[data-mode="runner"]', 1, 300)
    check('Runner only menu offers "Show Corp bad publicity" and not the tags option',
          pg.locator('#sheet [data-k="oppBad"]').count() == 1 and pg.locator('#sheet [data-k="oppTags"]').count() == 0)
    tap('#sheet [data-k="oppBad"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    b = pg.locator('.panel.runner [data-tile="corp-bad"]')
    check('Corp bad publicity counter appears in the Runner panel', b.count() == 1 and 'Corp bad publicity' in b.inner_text()
          and pg.locator('.tile.opp').count() == 1 and pg.locator('.tile.opp.runner').count() == 0)
    col = pg.evaluate("getComputedStyle(document.querySelector('[data-tile=\"corp-bad\"] .ico')).backgroundColor")
    check('Corp bad publicity icon in the Corp colour', col == 'rgb(47, 208, 255)', col)
    tap(step('corp', 'bad', 1), 3); pg.wait_for_timeout(100)
    check('Corp bad publicity +3', S(pg)['corp']['bad'] == 3)
    tap('#undoBtn'); pg.wait_for_timeout(150)
    check('undo works on Corp bad publicity', S(pg)['corp']['bad'] == 2 and 'Corp bad publicity' in pg.inner_text('#toast'))
    pg.wait_for_timeout(300)
    check('Runner-only layout with the extra counter fits', pg.evaluate("(()=>{const b=document.getElementById('board');return b.scrollHeight<=b.clientHeight+1})()"))
    pg.screenshot(path='screenshots/runner-only-corp-bad-publicity.png')
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet .choice[data-mode="both"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    check('both sides: no extra opponent counters (each side shows its own)', pg.locator('.tile.opp').count() == 0
          and pg.locator('[data-tile="corp-bad"]').count() == 1 and pg.locator('[data-tile="runner-tags"]').count() == 1)
    st = json.loads(pg.evaluate("localStorage.getItem('nrtracker.v1')"))['settings']
    check('opponent toggles saved', st['oppTags'] is True and st['oppBad'] is True, st)

    # ---- old saves (1.0-1.2 format): with and without recurring credits
    def old_save(f2f, with_rec):
        side = lambda extra: dict(clicks=3, credits=9, agenda=2, idUsed=False, **extra, **({'rec': 2, 'recMax': 2} if with_rec else {}))
        stt = {'mode': 'both', 'turn': 4, 'active': 'corp', 'corp': side({'bad': 1}), 'runner': side({'tags': 1, 'brain': 0})}
        prev = json.loads(json.dumps(stt)); prev['corp']['credits'] = 8
        return json.dumps({'v': 1, 'state': stt, 'undo': [{'s': prev, 'label': 'Corp credits +1'}],
                           'settings': {'showId': True, 'faceToFace': f2f, 'damage': 'core'}, 'helpSeen': True})
    for f2f, with_rec in [(False, True), (False, False), (True, True)]:
        pg.evaluate(f"localStorage.setItem('nrtracker.v1', {json.dumps(old_save(f2f, with_rec))})"); pg.reload(); pg.wait_for_timeout(800)
        st = S(pg)
        name = f'old save (face-to-face {"on" if f2f else "off"}, {"with" if with_rec else "without"} recurring credits)'
        check(f'{name}: loads, game intact, no welcome', st['turn'] == 4 and st['corp']['credits'] == 9 and st['runner']['tags'] == 1
              and not sheet_open(pg) and not errors, (st, errors))
        check(f'{name}: recurring fields dropped from state and undo', 'rec' not in st['corp'] and 'recMax' not in st['runner']
              and 'rec' not in json.loads(pg.evaluate("localStorage.getItem('nrtracker.v1')"))['undo'][0]['s']['corp'])
        check(f'{name}: now face-to-face', f2f_on())
        tap('#undoBtn'); pg.wait_for_timeout(150)
        check(f'{name}: undo still works', S(pg)['corp']['credits'] == 8)
        pg.wait_for_timeout(300)
    face_off(); pg.reload(); pg.wait_for_timeout(700)
    check('after the one-time switch, turning it off sticks', not f2f_on())

    # ---- options
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="showId"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    check('ID ability toggle can be hidden', pg.locator('.id-toggle[data-id="corp"]').is_hidden())
    tap('#menuBtn'); pg.wait_for_timeout(500); tap('#sheet [data-act="showId"]', 1, 300); tap('#sheet [data-act="close"]'); rest()
    check('and shown again', pg.locator('.id-toggle[data-id="corp"]').is_visible())

    # ---- help
    tap('#helpBtn'); pg.wait_for_timeout(500)
    check('help opens from the ? button', pg.locator('#sheet[data-kind="help"]').count() == 1)
    tap('#sheet [data-act="close"]'); rest()
    check('help closes', not sheet_open(pg))

    # ---- PWA
    man = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check('manifest standalone + icons', man['display'] == 'standalone' and len(man['icons']) >= 3)
    check('apple-touch-icon + meta tags', pg.evaluate("""!!document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('meta[name=apple-mobile-web-app-capable]').content==='yes' && /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content)"""))
    for ic in ['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']:
        check(f'{ic} served', pg.evaluate(f"fetch('{ic}').then(r=>r.ok)"))
    pg.wait_for_timeout(500)
    check('service worker controls the page', pg.evaluate("navigator.serviceWorker.ready.then(()=>!!navigator.serviceWorker.controller)") or (pg.reload() or pg.wait_for_timeout(800) or pg.evaluate("!!navigator.serviceWorker.controller")))
    check('no pull-to-refresh / bounce (overscroll-behavior none) and no double-tap zoom (touch-action)',
          pg.evaluate("getComputedStyle(document.body).overscrollBehaviorY==='none' && getComputedStyle(document.querySelector('.step')).touchAction==='manipulation'"))
    before = S(pg)
    ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(800)
    check('loads offline from the service worker cache, state intact', pg.locator('.panel').count() >= 1 and S(pg) == before)
    ctx.set_offline(False)
    check('no page errors', not errors, errors)
    br.close()

ok = sum(1 for _, c in results if c)
print(f'\n{ok}/{len(results)} checks passed')
sys.exit(0 if ok == len(results) else 1)
