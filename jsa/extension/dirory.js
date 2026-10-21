/**
 * Dirory for SketchUp for Web.
 *
 * The Dirory library inside SketchUp's browser version, through the SketchUp
 * JavaScript API (JSA). It talks to the same Dirory cloud as the desktop
 * plugin:
 *
 *   1. Library  - the catalogue (`catalog` Edge Function): models and materials
 *   2. Account  - the device sign-in (`auth-device`): a code approved on dirory.com
 *   3. Models   - `download` gives a short-lived link to the .skp; it is loaded
 *                 as a component definition and SketchUp's placement tool starts
 *   4. Materials - the texture image becomes a SketchUp material, which paints
 *                 the selection, or becomes the Paint Bucket's current material
 *
 * Dirory products are tagged with the "Dirory" attribute dictionary (asset_id,
 * type, name, brand, ...) exactly as the desktop plugin does, so a model
 * opened later in SketchUp desktop still knows what came from Dirory.
 *
 * Not yet here (SketchUp for Web does not expose them, or they come later):
 * the real-world tile size of a material (SketchUp's default texture size is
 * used), Quantifier and BoQ.
 */

// ---------------------------------------------------------------------------
// 1. Settings and small helpers
// ---------------------------------------------------------------------------

const API = 'https://ajlmncbzufagplbaaukv.supabase.co/functions/v1';
const API_KEY = 'sb_publishable_JIpzGVjnwobUxaGbhBEsHg_0Lfu_QPs';
const VERSION = '0.1.0';
const PAGE = 60;
const ATTR = 'Dirory';

// The token is kept in this browser when the page may store data; a sandboxed
// page that may not keeps it for the session only.
const memory = {};
const store = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return key in memory ? memory[key] : null; }
  },
  set(key, value) {
    memory[key] = value;
    try {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* this session only */ }
  },
};

function installId() {
  let id = store.get('dirory.install');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    store.set('dirory.install', id);
  }
  return id;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let toastTimer = null;
function toast(text, ms = 6000) {
  const box = document.getElementById('d-toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { apikey: API_KEY };
  if (body) headers['Content-Type'] = 'application/json';
  const token = store.get('dirory.token');
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// 2. The panel
// ---------------------------------------------------------------------------

document.body.innerHTML = `
  <header class="d-header">
    <div class="d-top">
      <img src="./logo.png" alt="">
      <strong>Dirory</strong>
      <button class="d-account" id="d-account">Sign in</button>
    </div>
    <nav class="d-tabs" role="tablist">
      <button class="d-tab active" data-tab="model" role="tab">Models</button>
      <button class="d-tab" data-tab="material" role="tab">Materials</button>
    </nav>
    <div class="d-controls">
      <input id="d-search" type="search" placeholder="Search name, category or brand…" autocomplete="off">
      <div class="d-filters">
        <select id="d-category" aria-label="Category"></select>
        <select id="d-brand" aria-label="Brand"></select>
      </div>
    </div>
  </header>
  <div id="d-sheet"></div>
  <div id="d-notice"></div>
  <main class="d-grid" id="d-grid"><p class="d-empty">Loading the Dirory library…</p></main>
  <button class="secondary d-more" id="d-more" hidden>Show more</button>
  <div class="d-toast" id="d-toast" hidden></div>
`;

const state = {
  items: [],
  tab: 'model',
  query: '',
  category: '',
  brand: '',
  shown: PAGE,
  user: JSON.parse(store.get('dirory.user') || 'null'),
  pending: null,     // device sign-in in progress
  afterSignIn: null, // what the architect clicked before signing in
  connected: false,
};

// ---------------------------------------------------------------------------
// 3. Library
// ---------------------------------------------------------------------------

async function loadCatalog() {
  try {
    const r = await call('/catalog');
    if (r.status !== 200 || !r.data) throw new Error('HTTP ' + r.status);
    state.items = (r.data.items || []).filter((i) => i.type === 'model' || i.type === 'material');
    fillFilters();
    render();
  } catch (e) {
    document.getElementById('d-grid').replaceChildren(
      el('p', 'd-empty', 'Could not load the Dirory library (' + e.message + '). Check your connection and reopen the panel.'));
  }
}

function inTab(item) {
  return item.type === state.tab;
}

function fillFilters() {
  const fill = (id, label, values, current) => {
    const select = document.getElementById(id);
    select.replaceChildren();
    const all = el('option', '', label);
    all.value = '';
    select.append(all);
    values.forEach((v) => {
      const o = el('option', '', v);
      o.value = v;
      o.selected = v === current;
      select.append(o);
    });
  };
  const items = state.items.filter(inTab);
  const uniq = (key) => Array.from(new Set(items.map((i) => i[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  fill('d-category', 'All categories', uniq('category'), state.category);
  fill('d-brand', 'All brands', uniq('brand'), state.brand);
}

function matches(item) {
  if (!inTab(item)) return false;
  if (state.category && item.category !== state.category) return false;
  if (state.brand && item.brand !== state.brand) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.category, item.brand].concat(item.tags || [])
    .some((t) => String(t || '').toLowerCase().indexOf(q) >= 0);
}

function render() {
  const grid = document.getElementById('d-grid');
  const list = state.items.filter(matches);
  grid.replaceChildren();
  if (!list.length) {
    grid.append(el('p', 'd-empty', state.query ? `Nothing found for "${state.query}".` : 'Nothing here yet.'));
  }
  list.slice(0, state.shown).forEach((item) => grid.append(card(item)));
  const more = document.getElementById('d-more');
  more.hidden = list.length <= state.shown;
  more.textContent = `Show more (${list.length - state.shown} left)`;
}

function card(item) {
  const node = el('button', 'd-card');
  node.type = 'button';
  node.title = item.type === 'model' ? `Place ${item.name}` : `Paint with ${item.name}`;
  const img = el('img', 'd-thumb');
  img.loading = 'lazy';
  img.alt = '';
  if (item.thumbnail_url) img.src = item.thumbnail_url;
  node.append(img, el('span', 'd-name', item.name),
    el('span', 'd-meta', [item.category, item.brand].filter(Boolean).join(' · ')));
  node.addEventListener('click', () => use(item, node));
  return node;
}

// ---------------------------------------------------------------------------
// 4. Account: device sign-in on dirory.com
// ---------------------------------------------------------------------------

function renderAccount() {
  const button = document.getElementById('d-account');
  button.textContent = state.user ? (state.user.name || String(state.user.email || '').split('@')[0] || 'Account') : 'Sign in';
  const sheet = document.getElementById('d-sheet');
  sheet.replaceChildren();
  if (!state.pending) return;
  const box = el('section', 'd-sheet');
  box.append(el('h2', '', 'Sign in to Dirory'));
  box.append(el('p', '', 'Open the sign-in page, sign in to your Dirory account and confirm this code:'));
  box.append(el('p', 'd-code', state.pending.user_code || ''));
  const row = el('div', 'd-row');
  const link = el('a', 'd-link', 'Open the sign-in page');
  link.href = state.pending.verification_url;
  link.target = '_blank';
  link.rel = 'noopener';
  const cancel = el('button', 'secondary', 'Cancel');
  cancel.addEventListener('click', () => { state.pending = null; renderAccount(); });
  row.append(link, cancel);
  box.append(row);
  box.append(el('p', 'd-meta', 'This panel signs in by itself once you confirm on the page.'));
  sheet.append(box);
}

async function signIn() {
  const r = await call('/auth-device/start', {
    method: 'POST', auth: false,
    body: { install_id: installId(), plugin_version: 'web-' + VERSION, platform: 'web' },
  });
  if (r.status !== 200 || !r.data || !r.data.device_code) {
    toast('Could not start sign-in (HTTP ' + r.status + '). Please try again.');
    return;
  }
  state.pending = r.data;
  renderAccount();
  try { window.open(r.data.verification_url, '_blank', 'noopener'); } catch (e) { /* the link is on the panel */ }
  const every = Math.max(3, Number(r.data.interval) || 5) * 1000;
  const until = Date.now() + (Number(r.data.expires_in) || 900) * 1000;
  const code = r.data.device_code;
  const poll = async () => {
    if (!state.pending || state.pending.device_code !== code) return;
    if (Date.now() > until) {
      state.pending = null;
      renderAccount();
      toast('The sign-in code expired. Click Sign in to try again.');
      return;
    }
    const p = await call('/auth-device/poll', { method: 'POST', auth: false, body: { device_code: code, install_id: installId() } });
    const status = p.data && p.data.status;
    if (status === 'approved' && p.data.token) {
      store.set('dirory.token', p.data.token);
      state.user = p.data.user || {};
      store.set('dirory.user', JSON.stringify(state.user));
      state.pending = null;
      renderAccount();
      toast('Signed in as ' + (state.user.name || state.user.email || 'you') + '.');
      const next = state.afterSignIn;
      state.afterSignIn = null;
      if (next) next();
      return;
    }
    if (status === 'expired' || status === 'denied') {
      state.pending = null;
      renderAccount();
      toast('Sign-in was not completed. Click Sign in to try again.');
      return;
    }
    setTimeout(poll, every);
  };
  setTimeout(poll, every);
}

async function signOut() {
  try { await call('/auth-device/revoke', { method: 'POST', body: {} }); } catch (e) { /* offline: it expires */ }
  store.set('dirory.token', null);
  store.set('dirory.user', null);
  state.user = null;
  renderAccount();
  toast('Signed out.');
}

document.getElementById('d-account').addEventListener('click', () => {
  if (state.user) signOut();
  else signIn();
});

// ---------------------------------------------------------------------------
// 5. Using a product: place a model, paint a material
// ---------------------------------------------------------------------------

async function use(item, node) {
  if (!store.get('dirory.token')) {
    state.afterSignIn = () => use(item, node);
    toast('Sign in to use Dirory products in your model.');
    signIn();
    return;
  }
  if (!state.connected) {
    toast('Open this panel inside SketchUp for Web to place models and paint materials.');
    return;
  }
  node.classList.add('busy');
  try {
    if (item.type === 'model') await placeModel(item);
    else await paintMaterial(item);
  } catch (e) {
    console.error('Dirory:', e);
    toast('Could not use ' + item.name + ': ' + (e && e.message ? e.message : e));
  } finally {
    node.classList.remove('busy');
  }
}

// A short-lived download link for the product's file.
async function download(item) {
  const r = await call('/download/' + encodeURIComponent(item.asset_id));
  if (r.status === 401) {
    store.set('dirory.token', null);
    state.user = null;
    renderAccount();
    throw new Error('your Dirory session has expired. Please sign in again');
  }
  if (r.status !== 200 || !r.data || !r.data.url) throw new Error('the download server answered HTTP ' + r.status);
  return r.data;
}

function tag(op, entity, item, file, type) {
  const set = (key, value) => {
    if (value != null && value !== '') op.entitySetAttribute(entity, ATTR, key, value);
  };
  set('id', item.asset_id);
  set('asset_id', item.asset_id);
  set('type', type);
  set('version', file && file.version ? Number(file.version) : null);
  set('name', item.name);
  set('category', item.category);
  set('brand', item.brand);
}

function taggedWith(entity, assetId) {
  try {
    return entity.attributes.findValue(ATTR, 'asset_id', { default: null }) === assetId;
  } catch (e) {
    return false;
  }
}

async function placeModel(item) {
  const model = await SketchUpApi.getActiveModel();
  // Already in this model: place another copy without downloading again.
  let definition = (await model.getDefinitions()).find((d) => taggedWith(d, item.asset_id));
  if (!definition) {
    toast('Downloading ' + item.name + '…', 20000);
    const file = await download(item);
    if (!/\.skp$/i.test(file.file_name || '')) throw new Error('this product has no SketchUp model file');
    await model.performOperation(async (op) => {
      const ref = await op.loadDefinition({ resource: { request: file.url } });
      definition = await op.entityForRef(ref);
      tag(op, definition, item, file, 'model');
    }, 'Load ' + item.name);
  }
  toast('Click in the model to place ' + item.name + '. Esc cancels.', 8000);
  try {
    await model.tools.placeComponentOnce(definition);
  } catch (e) {
    // A host without the placement tool: put one copy at the origin instead.
    await model.performOperation((op) => { op.createInstance(model.entities, definition); }, 'Place ' + item.name);
    toast(item.name + ' was added at the origin; move it into place.');
  }
}

async function imageBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('the image download answered HTTP ' + res.status);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('the image could not be read'));
    reader.readAsDataURL(blob);
  });
}

async function paintMaterial(item) {
  const model = await SketchUpApi.getActiveModel();
  let material = (await model.getMaterials()).values.find((m) => taggedWith(m, item.asset_id));
  if (!material) {
    toast('Downloading ' + item.name + '…', 20000);
    const file = await download(item);
    const base64 = await imageBase64(file.url);
    await model.performOperation(async (op) => {
      const ref = op.createMaterial('Dirory - ' + item.name);
      op.materialSetTextureDataBase64(ref, base64);
      material = await op.entityForRef(ref);
      tag(op, material, item, file, 'material');
    }, 'Add ' + item.name);
  }

  // Paint what is selected; with nothing selected, hand it to the Paint Bucket.
  const selection = await model.getSelection();
  const targets = selection.drawingElements.filter((e) => ['Face', 'Group', 'ComponentInstance'].indexOf(e.typeName) >= 0);
  await model.performOperation((op) => {
    try { op.setCurrentMaterial(material); } catch (e) { /* older hosts: painting still works */ }
    targets.forEach((e) => {
      if (e.typeName === 'Face') op.faceSetFrontMaterial(e, material);
      else op.drawingElementSetMaterial(e, material);
    });
  }, 'Paint ' + item.name);
  toast(targets.length
    ? `Painted ${targets.length} selected item${targets.length > 1 ? 's' : ''} with ${item.name}.`
    : `${item.name} is ready in the Paint Bucket: press B and click a surface. Or select faces first and click the card again.`, 9000);
}

// ---------------------------------------------------------------------------
// 6. Controls
// ---------------------------------------------------------------------------

document.querySelectorAll('.d-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.d-tab').forEach((t) => t.classList.toggle('active', t === tab));
  state.tab = tab.dataset.tab;
  state.category = '';
  state.brand = '';
  state.shown = PAGE;
  fillFilters();
  render();
}));
let searchTimer = null;
document.getElementById('d-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value; state.shown = PAGE; render(); }, 150);
});
document.getElementById('d-category').addEventListener('change', (e) => { state.category = e.target.value; state.shown = PAGE; render(); });
document.getElementById('d-brand').addEventListener('change', (e) => { state.brand = e.target.value; state.shown = PAGE; render(); });
document.getElementById('d-more').addEventListener('click', () => { state.shown += PAGE; render(); });

// ---------------------------------------------------------------------------
// 7. Start: register the command, connect to SketchUp, load the library
// ---------------------------------------------------------------------------

renderAccount();
loadCatalog();

try {
  // Handlers first: opening from the menu sends this command as the page loads.
  SketchUpApi.ui.on('open-dirory', () => {});
  // Outside SketchUp connect() never answers, so give it a few seconds.
  await Promise.race([
    SketchUpApi.connect({ whenOperationInProgress: 'queue' }),
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
  ]);
  state.connected = true;
} catch (e) {
  const note = el('p', 'd-note warn',
    'Not connected to SketchUp. You can browse the library here; to place models and paint, open Dirory from SketchUp for Web (Extensions menu).');
  document.getElementById('d-notice').append(note);
}
