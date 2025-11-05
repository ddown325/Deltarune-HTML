/* Dev Menu (press I+U+Y together to toggle)
   - Adds a small overlay with:
     - Item / Weapon / Armor inputs & quick lists
     - Give button that tries to call in-game functions (best-effort)
     - Fallback: stores in localStorage under "devmenu_inventory"
     - Close button
   - Non-invasive: doesn't change game files, only attaches DOM & window helpers.
*/

(function () {
  if (window.__devmenu_installed) return;
  window.__devmenu_installed = true;

  // --- style ---
  const style = document.createElement('style');
  style.textContent = `
  #devmenu-overlay{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:Arial,Helvetica,sans-serif}
  #devmenu { background:#111;color:#eee;padding:16px;border-radius:8px;min-width:320px;max-width:90%;box-shadow:0 6px 30px rgba(0,0,0,0.6) }
  #devmenu h2{margin:0 0 8px 0;font-size:16px}
  #devmenu .row{display:flex;gap:8px;align-items:center;margin:8px 0}
  #devmenu select,input[type="text"]{flex:1;padding:6px;border-radius:4px;border:1px solid #333;background:#222;color:#eee}
  #devmenu button{padding:6px 10px;border-radius:6px;border:none;background:#2a7;padding:color:#070;cursor:pointer}
  #devmenu button.secondary{background:#444;color:#ddd}
  #devmenu .feedback{font-size:12px;color:#9f9;margin-top:8px;min-height:18px}
  #devmenu .small{font-size:12px;color:#bbb}
  `;
  document.head.appendChild(style);

  // --- overlay ---
  const overlay = document.createElement('div');
  overlay.id = 'devmenu-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div id="devmenu" role="dialog" aria-modal="true">
      <h2>Dev Menu</h2>
      <div class="row">
        <label class="small">Type</label>
        <select id="devmenu-type">
          <option value="item">Item</option>
          <option value="weapon">Weapon</option>
          <option value="armor">Armor</option>
        </select>
      </div>
      <div class="row">
        <label class="small">Pick / Name</label>
        <select id="devmenu-quick">
        </select>
      </div>
      <div class="row">
        <label class="small">Custom name</label>
        <input type="text" id="devmenu-custom" placeholder="Type exact item/weapon/armor name">
      </div>
      <div class="row">
        <button id="devmenu-give">Give</button>
        <button id="devmenu-close" class="secondary">Close</button>
        <button id="devmenu-openInventory" class="secondary">View Inventory</button>
      </div>
      <div class="feedback" id="devmenu-feedback"></div>
      <div class="small">Hotkey: press I + U + Y simultaneously to toggle</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // --- lists (quick entries, add more names as you'd like) ---
  const QUICK = {
    item: [
      'Potion', 'MegaPotion', 'Fountain', 'Waffle', 'Chocolate', 'Apple'
    ],
    weapon: [
      'Wooden Sword', 'Steel Blade', 'Giant Axe', 'Blue Knife', 'Pacifier'
    ],
    armor: [
      'Leather Armor', 'Chainmail', 'Mystic Robe', 'Shield', 'Turtle Shell'
    ]
  };

  const quickSelect = overlay.querySelector('#devmenu-quick');
  const typeSelect = overlay.querySelector('#devmenu-type');
  const customInput = overlay.querySelector('#devmenu-custom');
  const giveBtn = overlay.querySelector('#devmenu-give');
  const closeBtn = overlay.querySelector('#devmenu-close');
  const openInvBtn = overlay.querySelector('#devmenu-openInventory');
  const feedback = overlay.querySelector('#devmenu-feedback');

  function populateQuick(type) {
    quickSelect.innerHTML = '';
    const list = QUICK[type] || [];
    list.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      quickSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '-- custom --';
    quickSelect.appendChild(customOpt);
  }
  populateQuick('item');

  typeSelect.addEventListener('change', (e) => {
    populateQuick(e.target.value);
  });

  quickSelect.addEventListener('change', () => {
    if (quickSelect.value === '__custom__') {
      customInput.focus();
    } else {
      customInput.value = quickSelect.value;
    }
  });

  // --- inventory fallback (localStorage) ---
  function readLocalInventory() {
    try {
      const raw = localStorage.getItem('devmenu_inventory');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeLocalInventory(arr) {
    localStorage.setItem('devmenu_inventory', JSON.stringify(arr));
  }
  window.devInventory = window.devInventory || { get: readLocalInventory, add: function (o) { const inv = readLocalInventory(); inv.push(o); writeLocalInventory(inv); return inv; } };

  // --- best-effort give function ---
  function tryGive(type, name) {
    name = String(name || '').trim();
    if (!name) {
      return { ok: false, message: 'Name required' };
    }

    // 1) Try known patterns on window (best-effort) - many ports expose a global "oprt", "game", or helper functions.
    const attempts = [];

    function attemptCall(fn) {
      try {
        const res = fn();
        if (res !== undefined) return { ok: true, message: 'Called function (result: ' + String(res) + ')' };
      } catch (e) {
        attempts.push(e && e.message ? e.message : String(e));
      }
      return null;
    }

    // a) dispatch custom event (some game ports may listen)
    try {
      const ev = new CustomEvent('dev-give', { detail: { type, name } });
      window.dispatchEvent(ev);
      attempts.push('dispatched event dev-give');
    } catch (e) { attempts.push('event failed: ' + e.message); }

    // b) try some likely function names (non-destructive attempts)
    const candidates = [
      () => window.giveItem && window.giveItem(name),
      () => window.giveWeapon && window.giveWeapon(name),
      () => window.giveArmor && window.giveArmor(name),
      () => window.oprt && window.oprt.giveItem && window.oprt.giveItem(name),
      () => window.oprt && window.oprt.addItem && window.oprt.addItem(name),
      () => window.oprt && window.oprt.addToInventory && window.oprt.addToInventory({ type, name }),
      () => window.addItem && window.addItem(name),
      () => window.player && window.player.give && window.player.give(type, name),
      () => window.postMessage && window.postMessage({ devGive: { type, name } }, '*')
    ];

    for (const c of candidates) {
      const r = attemptCall(c);
      if (r && r.ok) return r;
    }

    // Fallback: store in localInventory
    const record = { ts: Date.now(), type, name, source: 'devmenu-fallback' };
    window.devInventory.add(record);
    return { ok: true, message: 'Added to fallback inventory (localStorage)', record };
  }

  giveBtn.addEventListener('click', () => {
    const type = typeSelect.value;
    const name = customInput.value || quickSelect.value;
    const result = tryGive(type, name);
    feedback.textContent = result && result.message ? result.message : 'Unknown result';
    console.log('devmenu give result:', result);
  });

  closeBtn.addEventListener('click', () => {
    overlay.hidden = true;
    overlay.style.pointerEvents = 'none';
  });

  openInvBtn.addEventListener('click', () => {
    const inv = readLocalInventory();
    const lines = inv.length ? inv.map(i => `${new Date(i.ts).toLocaleString()} [${i.type}] ${i.name}`) : ['(empty)'];
    alert('Dev inventory (local fallback):\n\n' + lines.join('\n'));
  });

  // --- hotkey: I + U + Y simultaneously ---
  const required = new Set(['i', 'u', 'y']);
  const down = new Set();
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    down.add(k);
    // prevent conflict only when menu is open
    if (!overlay.hidden && (k === 'escape')) {
      overlay.hidden = true;
      return;
    }
    const all = [...required].every(x => down.has(x));
    if (all) {
      overlay.hidden = !overlay.hidden;
      if (!overlay.hidden) {
        overlay.style.pointerEvents = 'auto';
        customInput.focus();
      } else {
        overlay.style.pointerEvents = 'none';
      }
      // stop other handlers for this exact combo
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    const k = (e.key || '').toLowerCase();
    down.delete(k);
  }, true);

  // initially hide pointer events so it doesn't block the game
  overlay.style.pointerEvents = 'none';

  // Expose helpers for console usage
  window.devmenu = {
    tryGive,
    readLocalInventory,
    writeLocalInventory,
    show: () => { overlay.hidden = false; overlay.style.pointerEvents = 'auto'; customInput.focus(); },
    hide: () => { overlay.hidden = true; overlay.style.pointerEvents = 'none'; },
  };

  console.log('DevMenu installed. Press I + U + Y together to toggle. Access via window.devmenu');
})();