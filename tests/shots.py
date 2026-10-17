"""Quick screenshots: python3 tests/shots.py [base_url]"""
import sys, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
OUT = 'screenshots/'
def ctx(b):
    return b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    c = ctx(b); pg = c.new_page(); pg.goto(BASE); pg.wait_for_timeout(700)
    pg.screenshot(path=OUT+'welcome.png')
    pg.click('[data-act="start"]'); pg.wait_for_timeout(700)
    # make a mid-game state for the both-sides shot
    def tap(sel, n=1):
        for _ in range(n):
            pg.click(sel); pg.wait_for_timeout(30)
    pg.wait_for_timeout(500)
    tap('[data-side="corp"][data-key="clicks"][data-d="-1"]')
    tap('[data-side="corp"][data-key="credits"][data-d="1"]', 3)
    tap('[data-side="corp"][data-key="agenda"][data-d="1"]', 2)
    tap('[data-side="runner"][data-key="tags"][data-d="1"]')
    tap('[data-side="corp"][data-key="rec"][data-d="1"]', 2)
    pg.wait_for_timeout(2200)
    pg.screenshot(path=OUT+'both-sides.png')
    pg.evaluate("document.documentElement.style.setProperty('--safe-t','47px');document.documentElement.style.setProperty('--safe-b','34px')")
    pg.wait_for_timeout(300); pg.screenshot(path=OUT+'both-sides-with-safe-areas.png')
    pg.evaluate("document.documentElement.style.removeProperty('--safe-t');document.documentElement.style.removeProperty('--safe-b')")
    pg.click('#helpBtn'); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'help.png')
    pg.click('[data-act="close"]'); pg.wait_for_timeout(700)
    pg.click('#endBtn'); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'end-turn-confirm.png')
    pg.click('[data-act="confirm"]'); pg.wait_for_timeout(2200); pg.screenshot(path=OUT+'both-sides-runner-turn.png')
    pg.click('#menuBtn'); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'menu.png')
    pg.click('[data-act="setmode"][data-mode="runner"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="close"]'); pg.wait_for_timeout(700)
    tap('[data-side="runner"][data-key="clicks"][data-d="-1"]')
    tap('[data-side="runner"][data-key="credits"][data-d="1"]', 4)
    pg.wait_for_timeout(2200)
    pg.screenshot(path=OUT+'runner-only.png')
    pg.click('#menuBtn'); pg.wait_for_timeout(500)
    pg.click('[data-act="setmode"][data-mode="corp"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="close"]'); pg.wait_for_timeout(2200)
    pg.screenshot(path=OUT+'corp-only.png')
    # face-to-face (Corp half flipped) with simulated iPhone safe areas
    pg.click('#menuBtn'); pg.wait_for_timeout(500)
    pg.click('[data-act="setmode"][data-mode="both"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="face"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="close"]'); pg.wait_for_timeout(700)
    if pg.evaluate('window.__nrt.state.active') == 'runner':
        pg.click('#endBtn'); pg.wait_for_timeout(600); pg.click('[data-act="confirm"]'); pg.wait_for_timeout(700)
    pg.evaluate("document.documentElement.style.setProperty('--safe-t','47px');document.documentElement.style.setProperty('--safe-b','34px')")
    pg.wait_for_timeout(2200); pg.screenshot(path=OUT+'face-to-face.png')
    pg.click('#corpEndBtn'); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'face-to-face-corp-confirm.png')
    pg.click('[data-act="confirm"]'); pg.wait_for_timeout(2200); pg.screenshot(path=OUT+'face-to-face-runner-turn.png')
    # factions + damage name
    pg.evaluate("document.documentElement.style.removeProperty('--safe-t');document.documentElement.style.removeProperty('--safe-b')")
    pg.click('#menuBtn'); pg.wait_for_timeout(500)
    pg.click('[data-act="face"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="faction"][data-side="corp"]'); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT+'faction-picker.png')
    pg.click('.faction-opt[data-id="hb"]'); pg.wait_for_timeout(500)
    pg.click('[data-act="faction"][data-side="runner"]'); pg.wait_for_timeout(500)
    pg.click('.faction-opt[data-id="criminal"]'); pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('sheet').scrollTop = 1000"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'menu.png')
    pg.click('[data-act="close"]'); pg.wait_for_timeout(2200)
    pg.screenshot(path=OUT+'both-sides-factions.png')
    print('ok')
    b.close()
