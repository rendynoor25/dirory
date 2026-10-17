let allItems = [];
let currentFilter = 'all'; // 'all' | 'model' | 'material' | 'usage'
let selectedCategory = '';
let selectedBrand = '';
let heardFromRuby = false;
let selectedItemId = null;
let lastReportRequest = 0;
let lastReport = { models: [], materials: [] };
const quoteBrands = new Set();
const collapsedBrands = new Set(); // brands whose lists are folded in the Usage tab
let hideUnused = false;
const NO_BRAND = 'No brand';
const SAMPLE_BRAND = 'Dirory'; // Dirory's own free samples (no vendor, cannot be quoted)
// The same panel runs in SketchUp and in the Revit add-in (window.DIRORY_HOST).
const IS_REVIT = window.DIRORY_HOST === 'revit';
const DEFAULT_EMPTY_HTML = IS_REVIT
  ? 'No items found. Try another category or brand. In Revit, Models lists the products that have a Revit family (.rfa); more families are being added.'
  : 'No items found. Try another category or brand, or drop a <code>.skp</code> file ' +
  'anywhere inside your library folder and click \u27F3 to rescan.';

// Account: browsing and search are anonymous; insert, paint and quote need sign-in.
// Usage and project name are opt-in (UU PDP A3); search-miss reporting is
// anonymous and on unless switched off.
let account = { signedIn: false, shareUsage: false, shareProject: false, shareSearchMiss: true };
// Favourites: starred keys + keys used before (most recent first), and brand logos.
let favourites = new Set();
let recentKeys = [];
let brandLogos = {};     // lower-case brand name -> image URL
let pendingAction = null;   // what the user clicked before being asked to sign in
const reportedMisses = new Set(); // searches already reported in this session
// M6: asset ids currently downloading, and those already cached locally. Used to
// draw a download badge / progress ring on the card, like Thudio does.
const downloading = new Set();
const downloaded = new Set();

function isFav(item) {
  return favourites.has(item.key);
}

// Is this item part of the tab that is currently open?
function inCurrentTab(item) {
  if (currentFilter === 'all') return true;
  if (currentFilter === 'favourite') return isFav(item) || recentKeys.includes(item.key);
  return item.type === currentFilter;
}

function isSample(brand) {
  return String(brand || '').toLowerCase() === SAMPLE_BRAND.toLowerCase();
}

// After a new search, filter or tab, show the results from the top instead of
// leaving the user halfway down a list that just changed.
function scrollToTop() {
  if (window.scrollY > 0) window.scrollTo(0, 0);
}

// The header and the search/tabs bar are both pinned; the bar sits under the
// header, and the sticky Usage toolbar under both.
function trackControlsHeight() {
  const header = document.querySelector('header');
  const controls = document.getElementById('controls');
  const apply = () => {
    const root = document.documentElement.style;
    root.setProperty('--header-h', header.offsetHeight + 'px');
    root.setProperty('--controls-h', header.offsetHeight + controls.offsetHeight + 'px');
  };
  apply();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    ro.observe(controls);
  }
}

// The catalogue comes from the cloud, which takes a few seconds (longer on a
// slow connection): show a spinner and skeleton cards meanwhile.
let loadingNote = 'Products and materials come from the Dirory cloud. This takes a few seconds.';

function loadingState() {
  const box = el('div', 'loading-state');
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.appendChild(el('div', 'spinner'));
  box.appendChild(el('p', 'loading-title', 'Loading the Dirory catalogue…'));
  box.appendChild(el('p', 'loading-note', loadingNote));
  const skeletons = el('div', 'skeleton-grid');
  for (let i = 0; i < 6; i++) skeletons.appendChild(el('div', 'skeleton-card'));
  box.appendChild(skeletons);
  return box;
}

function updateLoadingNote(text) {
  loadingNote = text;
  const note = document.querySelector('.loading-state .loading-note');
  if (note) note.textContent = text;
}

// The same panel runs in SketchUp and in the Revit add-in; name the right app.
const HOST_NAME = IS_REVIT ? 'Revit' : 'SketchUp';
document.querySelectorAll('.host-name').forEach((n) => { n.textContent = HOST_NAME; });

// The usage report (which products a model uses) and its export, print and
// brand controls are SketchUp-only for now; in Revit the Usage tab is the
// quantities and the RAB, whose own buttons export Excel, CSV and print.
if (IS_REVIT) {
  ['usageRefresh', 'usageExport', 'usagePrint', 'usageSelectAll', 'usageToggleAll'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = true;
  });
}

window.addEventListener('load', () => {
  trackControlsHeight();
  document.getElementById('grid').appendChild(loadingState());
  sketchup.ready();
  setTimeout(() => {
    if (!heardFromRuby) updateLoadingNote('Still loading — a slow connection can take up to a minute.');
  }, 12000);
  // Only after a long silence is something likely wrong (e.g. an exception
  // in Ruby before the catalogue is sent): say how to find out.
  setTimeout(() => {
    if (!heardFromRuby) {
      updateLoadingNote('This is taking unusually long.');
      const diag = document.getElementById('diagnostic');
      diag.hidden = false;
      diag.textContent =
        'The catalogue has not arrived after 45 seconds. Check your internet connection, then close and re-open ' +
        'this panel. If it still does not load, open Window → Ruby Console and send us any red error message.';
    }
  }, 45000);
});

// When the user comes back from the SketchUp viewport to this panel, refresh
// the Usage table so it reflects what they just inserted or painted.
window.addEventListener('focus', () => {
  if (currentFilter === 'usage') requestReport(false);
});

window.diroryError = function (message) {
  const diag = document.getElementById('diagnostic');
  diag.hidden = false;
  diag.textContent = 'Error: ' + message;
};

// The search box only runs when the user commits it (Enter or the Search
// button). Typing does not filter, so a half-typed query is never shown and a
// backspace cannot silently drop the term the architect actually wanted — which
// matters because a zero-result search is how Dirory learns what is missing.
// The result of the committed search is what gets reported, once.
let appliedQuery = '';

function runSearch() {
  appliedQuery = document.getElementById('search').value.trim().toLowerCase();
  render();
  scrollToTop();
  checkSearchMiss();
}

document.getElementById('search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runSearch();
  }
});
document.getElementById('searchGo').addEventListener('click', runSearch);

// Keep the Search button visually "active" only when there is text waiting to
// be committed, so it is obvious that typing alone does not filter.
document.getElementById('search').addEventListener('input', () => {
  const typed = document.getElementById('search').value.trim().toLowerCase();
  document.getElementById('searchGo').classList.toggle('pending', typed !== appliedQuery);
});

document.getElementById('categoryFilter').addEventListener('change', (e) => {
  selectedCategory = e.target.value;
  render();
  scrollToTop();
});
document.getElementById('brandFilter').addEventListener('change', (e) => {
  selectedBrand = e.target.value;
  render();
  scrollToTop();
});

/* ------------------------------------------------------------------ */
/* Size filter (after Thudio's attribute filter)                       */
/* ------------------------------------------------------------------ */

let selectedSize = '';

// "60 × 120 cm" from the catalogue's [w, h], or '' when the item has none.
// Smaller side first: a 120 x 60 tile is the same product size as 60 x 120.
function sizeLabel(item) {
  const s = item.tile_size_cm;
  if (!Array.isArray(s) || s.length < 2 || !s[0]) return '';
  const [a, b] = [Number(s[0]), Number(s[1])].sort((x, y) => x - y);
  return `${a} × ${b} cm`;
}

// Shows the size select only when the list has two sizes or more.
function applySizeFilter(items) {
  const select = document.getElementById('sizeFilter');
  const counts = {};
  items.forEach((i) => {
    const label = sizeLabel(i);
    if (label) counts[label] = (counts[label] || 0) + 1;
  });
  const sides = (label) => label.match(/[\d.]+/g).map(Number);
  const sizes = Object.keys(counts).sort((a, b) => sides(a)[0] - sides(b)[0] || sides(a)[1] - sides(b)[1]);
  if (sizes.length < 2) {
    select.hidden = true;
    selectedSize = '';
    return items;
  }
  if (selectedSize && !counts[selectedSize]) selectedSize = '';
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All sizes';
  select.appendChild(all);
  sizes.forEach((label) => {
    const option = document.createElement('option');
    option.value = label;
    option.textContent = `${label} (${counts[label]})`;
    select.appendChild(option);
  });
  select.value = selectedSize;
  select.hidden = false;
  return selectedSize ? items.filter((i) => sizeLabel(i) === selectedSize) : items;
}

document.getElementById('sizeFilter').addEventListener('change', (e) => {
  selectedSize = e.target.value;
  render();
  scrollToTop();
});

/* ------------------------------------------------------------------ */
/* Colour family (after Thudio's Wall Paint browser)                   */
/*                                                                      */
/* The catalogue stores no colour, so each paint's colour is sampled    */
/* from its thumbnail once and remembered on this computer. A paint     */
/* card is a flat swatch, so the average is the colour itself.          */
/* ------------------------------------------------------------------ */

const PAINT_RE = /\b(paint|cat|colou?r)\b/i;
const COLOUR_FAMILIES = [
  ['white', 'White', '#f7f5ef'],
  ['cream', 'Cream', '#eadcb8'],
  ['yellow', 'Yellow', '#f2c94c'],
  ['orange', 'Orange', '#f2994a'],
  ['red', 'Red', '#d64545'],
  ['pink', 'Pink', '#f2a2c0'],
  ['purple', 'Purple', '#8e6cc0'],
  ['blue', 'Blue', '#3d7bd9'],
  ['green', 'Green', '#4caf6a'],
  ['brown', 'Brown', '#8a5a3b'],
  ['grey', 'Grey', '#9a9ca3'],
  ['black', 'Black', '#26272b'],
];
let selectedFamily = '';
const swatches = new Map(); // item key -> { hex, h, s, l }
const swatchPending = new Set();
let swatchRenderTimer = null;

function swatchCacheKey(item) {
  return `dirory.swatch.${item.asset_id || item.key}.${item.version || 0}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function swatchFromHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Chroma (0-255): how far the colour is from grey. HSL saturation runs to
  // 1.0 for barely-tinted whites such as #f5f5fd, so neutrals use chroma.
  const c = Math.max(r, g, b) - Math.min(r, g, b);
  return { hex, c, ...rgbToHsl(r, g, b) };
}

// Hue bands for paint cards: neutrals first, then by hue.
function familyOf(sw) {
  if (!sw) return '';
  const { h, l, c } = sw;
  if (l >= 0.92 && c <= 16) return 'white';
  if (l <= 0.14) return 'black';
  if (c <= 18) return 'grey';
  if (h >= 25 && h < 65 && l >= 0.72 && c <= 80) return 'cream';
  if (h >= 10 && h < 50 && l < 0.45) return 'brown';
  if (h < 12 || h >= 345) return l >= 0.72 ? 'pink' : 'red';
  if (h < 40) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

function isPaintList(items) {
  if (!items.length || !items.every((i) => i.type === 'material')) return false;
  if (selectedCategory) return PAINT_RE.test(selectedCategory);
  return items.every((i) => PAINT_RE.test(i.category || ''));
}

function swatchOf(item) {
  if (swatches.has(item.key)) return swatches.get(item.key);
  try {
    const hex = localStorage.getItem(swatchCacheKey(item));
    if (hex) {
      const sw = swatchFromHex(hex);
      swatches.set(item.key, sw);
      return sw;
    }
  } catch (e) { /* storage unavailable: sample again */ }
  return null;
}

// Load the thumbnail CORS-clean, shrink it to a few pixels and average them.
function sampleSwatch(item) {
  const src = item.thumbnail_url;
  if (!src || !/^https?:/i.test(src) || swatchPending.has(item.key)) return;
  swatchPending.add(item.key);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    swatchPending.delete(item.key);
    try {
      const size = 8;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
      if (!n) return;
      const hex = '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
      swatches.set(item.key, swatchFromHex(hex));
      try { localStorage.setItem(swatchCacheKey(item), hex); } catch (e) { /* not fatal */ }
      scheduleSwatchRender();
    } catch (e) {
      // A tainted canvas (no CORS) leaves the item without a family.
    }
  };
  img.onerror = () => swatchPending.delete(item.key);
  img.src = src;
}

function scheduleSwatchRender() {
  if (swatchRenderTimer) return;
  swatchRenderTimer = setTimeout(() => {
    swatchRenderTimer = null;
    render();
  }, 400);
}

// Shows the family chips for a paint list and narrows it to the chosen one.
function applyColourFamily(items) {
  const bar = document.getElementById('colourFamilies');
  if (!isPaintList(items)) {
    bar.hidden = true;
    selectedFamily = '';
    return items;
  }
  items.forEach((item) => { if (!swatchOf(item)) sampleSwatch(item); });

  const counts = {};
  items.forEach((item) => {
    const f = familyOf(swatchOf(item));
    if (f) counts[f] = (counts[f] || 0) + 1;
  });
  if (selectedFamily && !counts[selectedFamily]) selectedFamily = '';

  bar.innerHTML = '';
  const all = el('button', 'family-chip family-all' + (selectedFamily ? '' : ' active'), 'All colours');
  all.title = `All colours (${items.length})`;
  all.addEventListener('click', () => { selectedFamily = ''; render(); scrollToTop(); });
  bar.appendChild(all);
  COLOUR_FAMILIES.forEach(([id, label, hex]) => {
    if (!counts[id]) return;
    const chip = el('button', 'family-chip' + (selectedFamily === id ? ' active' : ''));
    chip.style.background = hex;
    chip.title = `${label} (${counts[id]})`;
    chip.setAttribute('aria-label', chip.title);
    chip.addEventListener('click', () => {
      selectedFamily = selectedFamily === id ? '' : id;
      render();
      scrollToTop();
    });
    bar.appendChild(chip);
  });
  bar.hidden = false;

  if (!selectedFamily) return items;
  // Light to dark inside a family, the way a fan deck is read.
  return items
    .filter((item) => familyOf(swatchOf(item)) === selectedFamily)
    .sort((a, b) => swatchOf(b).l - swatchOf(a).l);
}

document.getElementById('usageRefresh').addEventListener('click', () => requestReport(true));
document.getElementById('usageExport').addEventListener('click', () => sketchup.exportReport());
document.getElementById('usagePrint').addEventListener('click', () => sketchup.printSchedule());
document.getElementById('usageSelectAll').addEventListener('click', () => {
  const usable = brandGroups(lastReport).filter((g) => g.used && !g.sample);
  const allOn = usable.length > 0 && usable.every((g) => quoteBrands.has(g.brand));
  usable.forEach((g) => (allOn ? quoteBrands.delete(g.brand) : quoteBrands.add(g.brand)));
  window.diroryReport(lastReport);
});
document.getElementById('hideUnused').addEventListener('change', (e) => {
  hideUnused = e.target.checked;
  window.diroryReport(lastReport);
});
document.getElementById('usageToggleAll').addEventListener('click', () => {
  const groups = visibleGroups(lastReport);
  const allFolded = groups.length > 0 && groups.every((g) => collapsedBrands.has(g.brand));
  groups.forEach((g) => (allFolded ? collapsedBrands.delete(g.brand) : collapsedBrands.add(g.brand)));
  window.diroryReport(lastReport);
});
document.getElementById('quoteBtn').addEventListener('click', () => {
  if (quoteBrands.size === 0) return;
  const send = () => openQuote();
  if (!account.signedIn) {
    pendingAction = send;
    openAccount();
    return;
  }
  send();
});

/* ------------------------------------------------------------------ */
/* Ask for a Quote — server-side, with a consent form (M6 / FR-A20)    */
/* ------------------------------------------------------------------ */

function openQuote() {
  const brands = Array.from(quoteBrands);
  byId('quoteBrands').textContent = brands.length
    ? `Brands: ${brands.join(', ')}`
    : 'Select at least one brand in the Usage tab.';
  byId('quoteError').hidden = true;
  byId('quoteModal').hidden = false;
}

function closeQuote() {
  byId('quoteModal').hidden = true;
}

function submitQuote() {
  if (quoteBrands.size === 0) return;
  const brands = Array.from(quoteBrands);
  byId('quoteSubmit').disabled = true;
  sketchup.requestQuote(
    JSON.stringify({
      brands: brands,
      project_name: byId('quoteProject').value,
      city: byId('quoteCity').value,
      timeline: byId('quoteTimeline').value,
      note: byId('quoteNote').value,
      phone_shared: byId('quotePhoneShared').checked
    })
  );
}

byId('quoteClose').addEventListener('click', closeQuote);
byId('quoteModal').addEventListener('click', (e) => {
  if (e.target === byId('quoteModal')) closeQuote();
});
byId('quoteSubmit').addEventListener('click', submitQuote);

// Ruby reports whether the server-side quote was stored.
window.diroryQuoteResult = function (result) {
  byId('quoteSubmit').disabled = false;
  if (result && result.ok) {
    closeQuote();
  } else if (result && result.error) {
    byId('quoteError').textContent = result.error;
    byId('quoteError').hidden = false;
  }
};

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    // Categories are per-type, so a category picked under Models may not exist
    // under Materials; render() drops any selection that no longer applies.
    render();
    scrollToTop();
  });
});

// Called from Ruby via dialog.execute_script(...)
window.diroryRender = function (data) {
  heardFromRuby = true;
  document.getElementById('diagnostic').hidden = true;
  allItems = data.items || [];
  if (data.account) account = data.account;
  favourites = new Set(data.favourites || []);
  recentKeys = data.recent || [];
  brandLogos = data.brand_logos || {};
  updateAccountButton();
  document.getElementById('path').textContent = data.path;
  render();
};

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

function countBy(items, key) {
  const counts = new Map();
  items.forEach((item) => {
    const value = item[key] || '';
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function fillSelect(select, allLabel, emptyLabel, counts, selected) {
  select.innerHTML = '';
  const names = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
  // Keep the current selection visible even if the other filter empties it.
  if (selected && !counts.has(selected)) names.push(selected);

  if (names.length === 0) {
    select.add(new Option(emptyLabel, ''));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.add(new Option(allLabel, ''));
  names.forEach((name) => {
    select.add(new Option(`${name} (${counts.get(name) || 0})`, name));
  });
  select.value = selected;
}

function refreshFilters() {
  const inTab = allItems.filter(inCurrentTab);

  // Drop selections that don't exist for this tab.
  if (selectedCategory && !inTab.some((i) => i.category === selectedCategory)) selectedCategory = '';
  if (selectedBrand && !inTab.some((i) => i.brand === selectedBrand)) selectedBrand = '';

  // Cross-filter: category counts respect the chosen brand, and vice versa.
  const forCategories = inTab.filter((i) => !selectedBrand || i.brand === selectedBrand);
  const forBrands = inTab.filter((i) => !selectedCategory || i.category === selectedCategory);

  fillSelect(
    document.getElementById('categoryFilter'),
    'All categories', 'No categories', countBy(forCategories, 'category'), selectedCategory
  );
  fillSelect(
    document.getElementById('brandFilter'),
    'All brands', 'No brands yet', countBy(forBrands, 'brand'), selectedBrand
  );
}

// Autocomplete for the search box: categories and brands of the current tab,
// so typing "Clo" offers "Closet".
function refreshSuggestions() {
  const list = document.getElementById('searchSuggestions');
  list.innerHTML = '';
  const names = new Set();
  allItems
    .filter(inCurrentTab)
    .forEach((i) => {
      if (i.category) names.add(i.category);
      if (i.brand) names.add(i.brand);
    });
  Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      list.appendChild(option);
    });
}

/* ------------------------------------------------------------------ */
/* Library grid                                                       */
/* ------------------------------------------------------------------ */

function matchesSearch(item, q) {
  return (
    item.name.toLowerCase().includes(q) ||
    (item.category || '').toLowerCase().includes(q) ||
    (item.brand || '').toLowerCase().includes(q) ||
    (item.tags || []).some((t) => String(t).toLowerCase().includes(q))
  );
}

// A committed search that returns nothing in the WHOLE library (not just under
// the current tab / category / brand filter) is reported once, so Dirory can see
// what architects are looking for. Only real zero-result searches are sent —
// this is PRD FR-A14, and it is why search must be an explicit action: the term
// that gets reported is exactly the one the user committed.
function checkSearchMiss() {
  const q = appliedQuery;
  if (q.length < 3 || allItems.length === 0) return;
  if (allItems.some((item) => matchesSearch(item, q))) return;
  if (reportedMisses.has(q)) return;
  reportedMisses.add(q);
  if (!account.shareSearchMiss) return;
  sketchup.searchMiss(
    JSON.stringify({
      query: q,
      tab: currentFilter === 'model' || currentFilter === 'material' ? currentFilter : 'all',
    }),
  );
}

function render() {
  const usage = currentFilter === 'usage';
  document.getElementById('usage').hidden = !usage;
  document.getElementById('grid').hidden = usage;
  document.getElementById('filters').hidden = usage;
  document.getElementById('search').hidden = usage;
  document.getElementById('searchGo').hidden = usage;
  document.getElementById('hint').hidden = usage;
  // Quote requests are SketchUp-only for now (they come from the usage report).
  document.getElementById('quoteBar').hidden = !usage || IS_REVIT;
  if (usage) document.getElementById('brandBanner').hidden = true;

  if (usage) {
    document.getElementById('empty').hidden = true;
    requestReport(true);
    return;
  }

  refreshFilters();
  refreshSuggestions();
  renderBrandBanner();

  const q = appliedQuery;
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  // Until the catalogue arrives, show that it is loading rather than an
  // empty library (sign-in state can arrive first and re-render).
  if (!heardFromRuby) {
    document.getElementById('empty').hidden = true;
    grid.appendChild(loadingState());
    return;
  }

  let filtered = allItems.filter((item) => {
    const matchesType = inCurrentTab(item);
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    const matchesBrand = !selectedBrand || item.brand === selectedBrand;
    return matchesType && matchesCategory && matchesBrand && (!q || matchesSearch(item, q));
  });
  filtered = applySizeFilter(filtered);
  filtered = applyColourFamily(filtered);

  if (currentFilter === 'favourite') {
    // Starred first, then what was used before (most recent first).
    const rank = (i) => (isFav(i) ? -1 : recentKeys.indexOf(i.key));
    filtered.sort((a, b) => rank(a) - rank(b));
  }
  let lastSection = '';

  const emptyEl = document.getElementById('empty');
  emptyEl.hidden = filtered.length > 0;
  if (filtered.length === 0) {
    const raw = appliedQuery;
    // Zero results even across the whole library = something Dirory doesn't have yet.
    if (q && allItems.length > 0 && !allItems.some((i) => matchesSearch(i, q))) {
      emptyEl.textContent =
        q.length >= 3 && account.shareSearchMiss
          ? `No results for \u201C${raw}\u201D. It isn't in the library yet \u2014 we've noted your search so the Dirory team can add it.`
          : `No results for \u201C${raw}\u201D.`;
    } else if (currentFilter === 'favourite' && !q && !selectedCategory && !selectedBrand) {
      emptyEl.textContent =
        'No favourites yet. Tap \u2606 on a card to keep it here. Products you insert or paint also appear here automatically.';
    } else {
      emptyEl.innerHTML = DEFAULT_EMPTY_HTML;
    }
  }

  filtered.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${item.type === 'model' ? 'Place model' : 'Apply material'}: ${item.name}`);
    if (item.id === selectedItemId) card.classList.add('selected');
    if (item.sample) {
      card.classList.add('sample');
      card.appendChild(el('span', 'badge', 'Free sample'));
    }

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.draggable = false;
      img.setAttribute('draggable', 'false');
      // M6: cloud items carry a signed thumbnail_url; local items a file path.
      img.src =
        item.thumbnail_url ||
        (/^https?:/i.test(item.thumbnail) ? item.thumbnail : 'file:///' + item.thumbnail.replace(/\\/g, '/'));
      img.onerror = () => {
        img.remove();
        thumb.prepend(document.createTextNode(item.type === 'material' ? '🎨' : '📦'));
      };
      thumb.appendChild(img);
    } else {
      thumb.textContent = item.type === 'material' ? '🎨' : '📦';
    }
    thumb.addEventListener('dragstart', (event) => event.preventDefault());
    card.addEventListener('dragstart', (event) => event.preventDefault());
    const logo = brandLogoEl(item.brand, 'logo-chip-img', false);
    if (logo) {
      const chip = el('span', 'logo-chip');
      chip.appendChild(logo);
      thumb.appendChild(chip);
    }
    // Download state: a cloud item shows a badge until it is cached, then a tick.
    // Local-folder items are always "downloaded".
    const isCloud = !!item.asset_id;
    if (isCloud) {
      if (downloading.has(item.asset_id)) {
        thumb.appendChild(el('span', 'dl-badge busy', '⤓'));
      } else if (downloaded.has(item.asset_id)) {
        thumb.appendChild(el('span', 'dl-badge done', '✓'));
      } else {
        thumb.appendChild(el('span', 'dl-badge', '⤓'));
      }
    }
    // No per-card info button: product details are in the Inspector (🔍), which
    // shows the same information for whatever is selected in the model. The
    // bottom-right corner of the thumbnail is used by the Favourite star.
    card.appendChild(thumb);

    // Star: keep this product in the Favourite tab. Lives on the thumbnail so it
    // cannot collide with the download badge (top-right) or the brand chip
    // (bottom-left).
    const star = el('button', 'star' + (isFav(item) ? ' on' : ''), isFav(item) ? '★' : '☆');
    star.type = 'button';
    star.title = isFav(item) ? 'Remove from Favourite' : 'Add to Favourite';
    star.setAttribute('aria-label', star.title);
    star.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation(); // don't insert / paint
      if (favourites.has(item.key)) favourites.delete(item.key);
      else favourites.add(item.key);
      sketchup.toggleFavourite(item.key);
      if (currentFilter === 'favourite') {
        render();
      } else {
        star.classList.toggle('on', isFav(item));
        star.textContent = isFav(item) ? '★' : '☆';
        star.title = isFav(item) ? 'Remove from Favourite' : 'Add to Favourite';
      }
    });
    star.addEventListener('keydown', (event) => event.stopPropagation());
    thumb.appendChild(star);

    // Product info: specification, vendor page and quote, without placing it.
    const info = el('button', 'info-btn', 'i');
    info.type = 'button';
    info.title = 'Product info';
    info.setAttribute('aria-label', `Product info: ${item.name}`);
    info.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation(); // don't insert / paint
      openProductInfo(item);
    });
    info.addEventListener('keydown', (event) => event.stopPropagation());
    thumb.appendChild(info);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    card.appendChild(name);

    const cat = document.createElement('div');
    cat.className = 'category';
    cat.textContent = [item.category, item.brand].filter(Boolean).join(' · ');
    card.appendChild(cat);

    const runCard = () => {
      selectedItemId = item.id;
      document.querySelectorAll('.card.selected').forEach((selected) => selected.classList.remove('selected'));
      card.classList.add('selected');
      // Ruby needs the metadata too, so the Usage tab can group by category/brand.
      const payload = JSON.stringify({
        path: item.type === 'material' ? item.material_path : item.model_path,
        rfa_path: item.rfa_path || null,
        asset_id: item.asset_id || '',
        version: item.version || 1,
        tile_size_cm: item.tile_size_cm || null,
        name: item.name,
        category: item.category || '',
        brand: item.brand || '',
        // Everything the Inspector shows, so a placed item still knows its own
        // detail after the catalogue has moved on.
        sku: item.sku || null,
        product_url: item.product_url || null,
        dimensions: item.dimensions || null,
        su_version: item.su_version || null,
        tags: Array.isArray(item.tags) && item.tags.length ? item.tags : null
      });
      if (item.type === 'material') {
        sketchup.applyMaterial(payload);
      } else {
        sketchup.insertModel(payload);
      }
    };
    const chooseCard = () => {
      if (!account.signedIn && account.cloudConfigured !== false) {
        pendingAction = runCard;
        // Explain why the click did nothing, then open the sign-in dialog.
        if (window.diroryToast) {
          window.diroryToast({
            text:
              item.type === 'material'
                ? 'Sign in to paint this material onto a surface.'
                : 'Sign in to load this model into your project.',
            ms: 5000,
          });
        }
        openAccount();
        return;
      }
      runCard();
    };
    card.addEventListener('click', chooseCard);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseCard();
      }
    });

    if (currentFilter === 'favourite') {
      const section = isFav(item) ? 'star' : 'recent';
      if (section !== lastSection) {
        lastSection = section;
        grid.appendChild(
          el('div', 'grid-heading', section === 'star' ? '★ Starred' : '🕘 Used before')
        );
      }
    }
    grid.appendChild(card);
  });
}

/* ------------------------------------------------------------------ */
/* Brand logos                                                        */
/* ------------------------------------------------------------------ */

// A brand's logo picture (from <library>/Brands/). withInitial: show a round
// letter when there is no picture; otherwise return null so nothing is drawn.
function brandLogoEl(brand, className, withInitial) {
  const url = brandLogos[String(brand || '').toLowerCase()];
  const initial = () =>
    el('span', className + ' initial', (String(brand || '?').trim()[0] || '?').toUpperCase());
  if (!url) return withInitial ? initial() : null;
  const img = document.createElement('img');
  img.className = className;
  img.alt = brand;
  img.draggable = false;
  img.src = url;
  img.onerror = () => {
    if (withInitial) img.replaceWith(initial());
    else img.remove();
  };
  return img;
}

// When a brand is picked in the filter, show its logo and totals above the list.
function renderBrandBanner() {
  const banner = document.getElementById('brandBanner');
  banner.innerHTML = '';
  if (!selectedBrand) {
    banner.hidden = true;
    return;
  }
  const models = allItems.filter((i) => i.brand === selectedBrand && i.type === 'model').length;
  const materials = allItems.filter((i) => i.brand === selectedBrand && i.type === 'material').length;
  banner.appendChild(brandLogoEl(selectedBrand, 'logo-lg', true));
  const text = el('div', 'brand-banner-text');
  text.appendChild(el('div', 'brand-banner-name', selectedBrand));
  const parts = [];
  if (models) parts.push(`${models} model${models === 1 ? '' : 's'}`);
  if (materials) parts.push(`${materials} material${materials === 1 ? '' : 's'}`);
  const sub = parts.join(' \u00B7 ');
  text.appendChild(el('div', 'brand-banner-sub', isSample(selectedBrand) ? `Free samples \u00B7 ${sub}` : sub));
  banner.appendChild(text);
  const clear = el('button', 'ghost-btn', 'Show all brands');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    selectedBrand = '';
    render();
    scrollToTop();
  });
  banner.appendChild(clear);
  banner.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Usage tab                                                          */
/* ------------------------------------------------------------------ */

function requestReport(force) {
  const now = Date.now();
  // Focus events can fire in quick bursts; don't rescan a big model each time.
  if (!force && now - lastReportRequest < 2000) return;
  lastReportRequest = now;
  sketchup.requestReport();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function itemCell(row) {
  const td = el('td');
  td.appendChild(el('div', 'u-name', row.name));
  if (row.category) td.appendChild(el('div', 'u-sub', row.category));
  return td;
}

function buildTable(labels, rows, cellsFor) {
  const table = el('table', 'usage-table');
  const head = el('tr');
  labels.forEach((label, i) => head.appendChild(el('th', i > 0 ? 'num' : '', label)));
  table.appendChild(head);
  rows.forEach((row) => {
    const tr = el('tr', row.zero ? 'zero' : '');
    tr.appendChild(itemCell(row));
    cellsFor(row).forEach((text) => tr.appendChild(el('td', 'num', text)));
    table.appendChild(tr);
  });
  return table;
}

// Groups the flat report rows by brand ("No brand" goes last).
function brandGroups(data) {
  const groups = new Map();
  const get = (brand) => {
    const key = brand || NO_BRAND;
    if (!groups.has(key)) groups.set(key, { brand: key, models: [], materials: [] });
    return groups.get(key);
  };
  (data.models || []).forEach((r) => get(r.brand).models.push(Object.assign({ zero: r.count === 0 }, r)));
  (data.materials || []).forEach((r) => get(r.brand).materials.push(Object.assign({ zero: r.faces === 0 }, r)));

  const list = Array.from(groups.values());
  list.forEach((g) => {
    g.qty = g.models.reduce((sum, r) => sum + r.count, 0);
    g.faces = g.materials.reduce((sum, r) => sum + r.faces, 0);
    g.area = g.materials.reduce((sum, r) => sum + r.area_m2, 0);
    g.used = g.qty > 0 || g.faces > 0; // only brands actually used can be quoted
    g.sample = isSample(g.brand);      // Dirory's free samples have no vendor to quote
  });
  const rank = (g) => (g.sample ? 1 : g.brand === NO_BRAND ? 2 : 0);
  return list.sort((a, b) => rank(a) - rank(b) || a.brand.localeCompare(b.brand));
}

function updateQuoteButton() {
  const btn = document.getElementById('quoteBtn');
  const n = quoteBrands.size;
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? '🛒 Ask for a Quote' : `🛒 Ask for a Quote (${n} brand${n > 1 ? 's' : ''})`;
}

// Brands shown in the Usage tab (unused brands are dropped when "Hide unused" is on).
function visibleGroups(data) {
  const groups = brandGroups(data);
  return hideUnused ? groups.filter((g) => g.used) : groups;
}

function updateToggleAll(groups) {
  const btn = document.getElementById('usageToggleAll');
  const allFolded = groups.length > 0 && groups.every((g) => collapsedBrands.has(g.brand));
  btn.textContent = allFolded ? '▾ Expand all' : '▴ Collapse all';
  btn.disabled = groups.length === 0;
}

window.diroryReport = function (data) {
  lastReport = data;
  const allGroups = brandGroups(data);
  const groups = hideUnused ? allGroups.filter((g) => g.used) : allGroups;
  const container = document.getElementById('brandGroups');
  container.innerHTML = '';

  // Forget ticked brands that no longer have anything in the model.
  Array.from(quoteBrands).forEach((b) => {
    if (!allGroups.some((g) => g.brand === b && g.used && !g.sample)) quoteBrands.delete(b);
  });

  const totalQty = allGroups.reduce((sum, g) => sum + g.qty, 0);
  const totalArea = allGroups.reduce((sum, g) => sum + g.area, 0);
  document.getElementById('usageTotals').textContent = allGroups.length
    ? `${totalQty} model${totalQty === 1 ? '' : 's'} · ${totalArea.toFixed(2)} m² painted · ${allGroups.filter((g) => g.used).length} brand(s) in use`
    : '';

  updateToggleAll(groups);

  if (allGroups.length === 0) {
    container.appendChild(
      el('div', 'u-empty', 'No Dirory models or materials in this file yet. Insert one from the library, then come back here.')
    );
    updateQuoteButton();
    return;
  }
  if (groups.length === 0) {
    container.appendChild(
      el('div', 'u-empty', 'Nothing from the library is used in this model yet. Untick "Hide unused" to see the full list.')
    );
    updateQuoteButton();
    return;
  }

  groups.forEach((g) => {
    const card = el('div', 'brand-card' + (g.used ? '' : ' unused'));

    const head = el('label', 'brand-head');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = quoteBrands.has(g.brand);
    box.disabled = !g.used || g.sample;
    box.addEventListener('change', () => {
      if (box.checked) quoteBrands.add(g.brand);
      else quoteBrands.delete(g.brand);
      updateQuoteButton();
    });
    head.appendChild(box);
    head.appendChild(brandLogoEl(g.brand, 'logo-sm', true));
    head.appendChild(el('span', 'brand-name', g.brand));
    const parts = [];
    if (g.models.length) parts.push(`${g.qty} model${g.qty === 1 ? '' : 's'}`);
    if (g.materials.length) parts.push(`${g.area.toFixed(2)} m²`);
    const summary = g.used ? parts.join(' · ') : 'not used yet';
    head.appendChild(el('span', 'brand-summary', g.sample ? `free sample · ${summary}` : summary));

    // Fold / unfold this brand's list, so a long report doesn't need endless scrolling.
    const body = el('div', 'brand-body');
    const folded = collapsedBrands.has(g.brand);
    body.hidden = folded;
    const toggle = el('button', 'brand-toggle', folded ? '▸' : '▾');
    toggle.type = 'button';
    toggle.title = 'Show / hide this brand\'s list';
    toggle.addEventListener('click', (event) => {
      event.preventDefault();   // don't tick the quote checkbox
      event.stopPropagation();
      if (collapsedBrands.has(g.brand)) collapsedBrands.delete(g.brand);
      else collapsedBrands.add(g.brand);
      const nowFolded = collapsedBrands.has(g.brand);
      body.hidden = nowFolded;
      toggle.textContent = nowFolded ? '▸' : '▾';
      updateToggleAll(groups);
    });
    head.appendChild(toggle);
    card.appendChild(head);

    const models = hideUnused ? g.models.filter((r) => !r.zero) : g.models;
    const materials = hideUnused ? g.materials.filter((r) => !r.zero) : g.materials;
    if (models.length) {
      body.appendChild(buildTable(['Models', 'Qty'], models, (r) => [String(r.count)]));
    }
    if (materials.length) {
      body.appendChild(
        buildTable(['Materials', 'Faces', 'Area (m²)'], materials, (r) => [String(r.faces), r.area_m2.toFixed(2)])
      );
    }
    card.appendChild(body);
    container.appendChild(card);
  });

  updateQuoteButton();
};

/* ------------------------------------------------------------------ */
/* Account: sign-in, sign-out and the "share usage" switch            */
/* ------------------------------------------------------------------ */

function byId(id) {
  return document.getElementById(id);
}

function updateAccountButton() {
  const btn = byId('accountBtn');
  btn.classList.toggle('signed-in', !!account.signedIn);
  btn.classList.toggle('needs-consent', !!account.consentNeeded);
  if (account.signedIn) {
    // Show who is signed in: the name, or the part of the email before "@".
    const label = (account.name || '').trim() || String(account.email || '').split('@')[0] || 'Account';
    btn.textContent = label;
    btn.title = `Signed in as ${account.name ? account.name + ' · ' : ''}${account.email || ''}`;
    if (account.consentNeeded) btn.title += ' · please confirm what you share';
  } else {
    btn.textContent = '👤';
    btn.title = 'Sign in';
  }
}

/* ------------------------------------------------------------------ */
/* Internationalisation (English / Bahasa Indonesia)                   */
/* ------------------------------------------------------------------ */

// Ruby pushes the dictionary for the selected language. Every element with a
// data-i18n attribute is filled from it; anything missing falls back to English
// server-side, so a partial translation is always safe.
let i18n = {};
let languages = { en: 'English' };

function t(key, vars) {
  let text = i18n[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      text = text.replace(new RegExp('%\\{' + k + '\\}', 'g'), vars[k]);
    });
  }
  return text;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  render();
}

window.diroryI18n = function (data) {
  i18n = (data && data.strings) || {};
  languages = (data && data.languages) || languages;
  document.documentElement.lang = (data && data.language) || 'en';
  const select = byId('languageSelect');
  if (select) {
    select.innerHTML = '';
    Object.keys(languages).forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = languages[code];
      select.appendChild(opt);
    });
    select.value = (data && data.language) || 'en';
  }
  byId('settingsVersion').textContent = t('settings.version', {
    version: (data && data.version) || '',
  });
  applyTranslations();
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function openSettings() {
  byId('settingsModal').hidden = false;
}
function closeSettings() {
  byId('settingsModal').hidden = true;
}
byId('settingsBtn').addEventListener('click', openSettings);
byId('settingsClose').addEventListener('click', closeSettings);
byId('settingsModal').addEventListener('click', (e) => {
  if (e.target === byId('settingsModal')) closeSettings();
});
byId('languageSelect').addEventListener('change', (e) => {
  sketchup.setLanguage(JSON.stringify({ language: e.target.value }));
});

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

// Ruby tells the panel whether a newer version exists; show the toolbar badge.
window.diroryUpdate = function (state) {
  updateState = state || {};
  const btn = byId('updateBtn');
  if (btn) {
    btn.hidden = !updateState.available;
    if (updateState.available && updateState.latest) {
      btn.title = t('update.latest', { version: updateState.latest });
    }
  }
  if (updateState.staged) {
    // An update is already downloaded and waiting for a restart.
    if (btn) btn.hidden = false;
    byId('settingsUpdateMsg').textContent = t('update.staged');
  }
};

// Download progress from Ruby: { received, total }. total is -1 when unknown,
// in which case the spinner alone says "working" and no percentage is shown.
window.diroryUpdateProgress = function (p) {
  const block = byId('updateProgress');
  const track = block ? block.querySelector('.progress-track') : null;
  const bar = byId('updateBar');
  const msg = byId('updateProgressMsg');
  if (!block) return;
  block.hidden = false;
  const received = (p && p.received) || 0;
  const total = (p && p.total) || 0;
  if (track) track.classList.toggle('indeterminate', !(total > 0));
  if (bar && total > 0) bar.style.width = Math.min(100, Math.round((received / total) * 100)) + '%';
  if (msg) {
    msg.textContent =
      total > 0
        ? t('update.downloading', { percent: Math.min(100, Math.round((received / total) * 100)) })
        : t('update.downloading_unknown');
  }
};

function hideUpdateProgress() {
  const block = byId('updateProgress');
  if (block) {
    block.hidden = true;
    const track = block.querySelector('.progress-track');
    if (track) track.classList.remove('indeterminate');
  }
  const bar = byId('updateBar');
  if (bar) bar.style.width = '0%';
}

window.diroryUpdateResult = function (result) {
  hideUpdateProgress();
  const msg = byId('settingsUpdateMsg');
  if (result && result.ok) {
    if (msg) msg.textContent = t('update.staged');
    if (window.diroryToast) window.diroryToast({ text: t('update.staged'), ms: 9000 });
  } else {
    const err = (result && result.error) || '';
    if (msg) msg.textContent = t('update.failed', { error: err });
    if (window.diroryToast) window.diroryToast({ text: t('update.failed', { error: err }), ms: 7000 });
  }
};

let updateState = {};

byId('updateBtn').addEventListener('click', () => {
  openSettings();
  hideUpdateProgress();
  const block = byId('updateProgress');
  if (block) block.hidden = false;
  byId('settingsUpdateMsg').textContent = t('update.downloading_unknown');
  sketchup.downloadUpdate();
});
byId('settingsUpdate').addEventListener('click', () => {
  byId('settingsUpdateMsg').textContent = t('update.checking');
  sketchup.checkForUpdate();
});

/* ------------------------------------------------------------------ */
/* Toast: short messages ("sign in to load into your project")          */
/* ------------------------------------------------------------------ */

let toastTimer = null;
window.diroryToast = function (data) {
  const el = byId('toast');
  if (!el) return;
  const text = typeof data === 'string' ? data : (data && data.text) || '';
  if (!text) return;
  el.textContent = text;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
    toastTimer = null;
  }, (data && data.ms) || 6000);
};

function openAccount() {
  byId('signInView').hidden = !!account.signedIn;
  byId('accountView').hidden = !account.signedIn;
  byId('acctWho').textContent = account.signedIn ? `${account.name || ''}${account.name ? ' · ' : ''}${account.email}` : '';
  byId('shareUsage').checked = !!account.shareUsage;
  byId('shareProject').checked = !!account.shareProject;
  // The project-name switch is meaningless while anonymous reporting is off.
  byId('shareProject').disabled = !account.shareUsage;
  byId('shareSearchMiss').checked = !!account.shareSearchMiss;
  byId('consentNeeded').hidden = !account.consentNeeded;
  byId('acctError').hidden = true;
  applyDeviceState();
  byId('accountModal').hidden = false;
}

// M6: the sign-in is a browser device-code flow, so the panel shows the code
// and waits rather than collecting a name/email locally.
function applyDeviceState() {
  const pending = !!account.devicePending;
  byId('devicePending').hidden = !pending;
  byId('deviceIdle').hidden = pending;
  if (pending) {
    // No code is shown any more: sign-in is Google OAuth in the browser.
    byId('deviceStatus').textContent = account.deviceStatus
      ? 'Waiting for you to finish in the browser… (' + account.deviceStatus + ')'
      : 'Waiting for you to finish in the browser…';
  }
}

function closeAccount(dropPending) {
  byId('accountModal').hidden = true;
  if (dropPending) pendingAction = null;
}

function submitSignIn() {
  // Google sign-in happens in the browser (Google does not allow it inside an
  // embedded panel); the plugin only starts the flow and waits for approval.
  sketchup.signIn(JSON.stringify({ provider: 'google' }));
}

byId('accountBtn').addEventListener('click', openAccount);
byId('accountClose').addEventListener('click', () => closeAccount(true));
byId('accountModal').addEventListener('click', (e) => {
  if (e.target === byId('accountModal')) closeAccount(true);
});
byId('acctSubmit').addEventListener('click', submitSignIn);
byId('acctReopen').addEventListener('click', () => sketchup.openSignInPage());
byId('acctCancel').addEventListener('click', () => {
  sketchup.cancelSignIn();
  closeAccount(true);
});
byId('acctSignOut').addEventListener('click', () => sketchup.signOut());
byId('shareUsage').addEventListener('change', (e) => {
  sketchup.setShareUsage(JSON.stringify({ on: e.target.checked }));
  // Keep the dependent switch visually consistent without waiting for Ruby.
  account.shareUsage = e.target.checked;
  byId('shareProject').disabled = !e.target.checked;
  if (!e.target.checked) {
    // Turning off anonymous reporting must also stop the title, even if the
    // user had opted in earlier: there is nothing left to attach it to.
    byId('shareProject').checked = false;
  }
});
byId('shareProject').addEventListener('change', (e) => {
  sketchup.setShareProject(JSON.stringify({ on: e.target.checked }));
});
byId('shareSearchMiss').addEventListener('change', (e) => {
  sketchup.setShareSearchMiss(JSON.stringify({ on: e.target.checked }));
  account.shareSearchMiss = e.target.checked;
});

// Architects who signed in before the download page asked for these choices
// confirm them here (UU PDP A3). Nothing is shared until they do.
byId('consentConfirm').addEventListener('click', () => {
  sketchup.consentSave(
    JSON.stringify({
      shareUsage: byId('shareUsage').checked,
      shareProject: byId('shareUsage').checked && byId('shareProject').checked,
      shareSearchMiss: byId('shareSearchMiss').checked,
    }),
  );
});byId('privacyLink').addEventListener('click', (e) => {
  e.preventDefault();
  sketchup.openPrivacy();
});

// Ruby asks for a sign-in when an insert / paint / quote arrives without one.
// Show a toast explaining *why* the click did nothing, then open the account
// modal so the user can sign in. (Reported: clicking a card seemed to do
// nothing when signed out.)
window.diroryNeedSignIn = function (data) {
  const action = (data && data.action) || 'load';
  const text =
    action === 'material'
      ? 'Sign in to paint this material onto a surface.'
      : action === 'quote'
        ? 'Sign in to ask this brand for a quote.'
        : 'Sign in to load this model into your project.';
  if (window.diroryToast) window.diroryToast({ text: text, ms: 6000 });
  openAccount();
};

// Ruby pushes the account state after sign-in, sign-out or a settings change.
window.diroryAccount = function (state) {
  const was = !!account.signedIn;
  const wasPending = !!account.devicePending;
  account = state;
  updateAccountButton();
  if (state.error) {
    byId('acctError').textContent = state.error;
    byId('acctError').hidden = false;
    applyDeviceState();
    return;
  }
  applyDeviceState();
  if (state.signedIn && !was) {
    closeAccount(false);
    if (pendingAction) {
      const run = pendingAction;
      pendingAction = null;
      run(); // carry on with what the user clicked
    }
  } else if (!state.signedIn && was) {
    closeAccount(true);
  } else if (wasPending && !state.devicePending && !state.signedIn) {
    byId('acctError').textContent = 'Sign-in was not completed. Please try again.';
    byId('acctError').hidden = false;
  }
  if (state.signedIn) startLive();
  else if (was) stopLive();
  render(); // the empty-search message depends on the share setting
};

// Ruby pushes this after a product is inserted or painted ("used before").
window.diroryFavourites = function (data) {
  favourites = new Set(data.favourites || []);
  recentKeys = data.recent || [];
  if (currentFilter === 'favourite') render();
};

/* ------------------------------------------------------------------ */
/* Download state (M6): badges on cloud cards                          */
/* ------------------------------------------------------------------ */

// Ruby tells the panel an asset finished downloading (or is now cached), so the
// badge turns into a tick.
window.diroryDownloaded = function (data) {
  const id = String((data && data.asset_id) || '');
  if (!id) return;
  downloading.delete(id);
  downloaded.add(id);
  render();
};

window.diroryDownloading = function (data) {
  const id = String((data && data.asset_id) || '');
  if (!id) return;
  downloading.add(id);
  render();
};

/* ------------------------------------------------------------------ */
/* Quantity takeoff (RAB step 1)                                       */
/* ------------------------------------------------------------------ */

const ELEMENT_LABELS = {
  structure: 'Structure (struktur)',
  wall: 'Wall (dinding)',
  floor: 'Floor (lantai)',
  ceiling: 'Ceiling (plafon)',
  roof: 'Roof (atap)',
  mep: 'MEP (mekanikal, elektrikal, plumbing)',
  demolition: 'Demolition (pembongkaran)',
  site: 'Landscape (lansekap)',
};

/* "What is this?" (SketchUp): what each material and tag was measured as,
   and the architect's corrections (takeoff.rb, roles). */
const ROLE_LABELS = {
  auto: 'Auto (by direction)',
  wall: 'Wall',
  floor: 'Floor',
  ceiling: 'Ceiling',
  roof: 'Roof',
  landscape_hard: 'Hardscape (paving, gravel)',
  landscape_soft: 'Softscape (grass, soil)',
  glass: 'Glass (not a finish)',
  frame: 'Timber / steel frame',
  ignore: 'Ignore (not built)',
  door: 'Door',
  window: 'Window',
};
// A material or tag can be mapped to a surface role; door, window and frame
// only make sense for a marked group or component.
const MAP_ROLES = ['auto', 'wall', 'floor', 'ceiling', 'roof', 'landscape_hard', 'landscape_soft', 'glass', 'ignore'];
const BUCKET_LABELS = {
  wall: 'wall', floor: 'floor', ceiling: 'ceiling', roof: 'roof',
  landscape_hard: 'hardscape', landscape_soft: 'softscape', landscape_edge: 'landscape edge',
  glass: 'glass', edge: 'edge strip', underside: 'underside at ground', soffit: 'bare roof underside', ignore: 'ignored',
};

function roleSelect(roles, value, onChange) {
  const select = el('select', 'map-role');
  roles.forEach((r) => {
    const o = el('option', '', ROLE_LABELS[r]);
    o.value = r;
    o.selected = r === value;
    select.appendChild(o);
  });
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderMapping(body, data) {
  const classes = Array.isArray(data.classes) ? data.classes : null;
  if (!classes) return;
  const mapping = {
    materials: Object.assign({}, (data.mapping && data.mapping.materials) || {}),
    tags: Object.assign({}, (data.mapping && data.mapping.tags) || {}),
  };
  const box = el('details', 'map-box');
  const changed = Object.keys(mapping.materials).length + Object.keys(mapping.tags).length;
  box.open = !changed;
  box.appendChild(el('summary', 'takeoff-element', 'What is this? Check what was measured'));
  box.appendChild(el('p', 'usage-note',
    'Each material (and tag) and what it was counted as. Change the role where the guess is wrong: ' +
    'the model is measured again. Faces with no material ("Unpainted") are usually unfinished concrete or ' +
    'construction lines: check them first.'));

  // Mark the selection: for a group, component or face the material cannot tell.
  const bar = el('div', 'map-bar');
  bar.appendChild(el('span', '', 'Mark selection as '));
  let markRole = 'ignore';
  bar.appendChild(roleSelect(Object.keys(ROLE_LABELS), markRole, (r) => { markRole = r; }));
  const mark = el('button', 'ghost-btn', 'Mark');
  mark.addEventListener('click', () => {
    byId('takeoffRun').disabled = true;
    byId('takeoffRun').textContent = 'Measuring…';
    sketchup.markSelection({ role: markRole });
  });
  bar.appendChild(mark);
  box.appendChild(bar);

  const save = () => {
    byId('takeoffRun').disabled = true;
    byId('takeoffRun').textContent = 'Measuring…';
    sketchup.saveMapping(mapping);
  };
  const shown = classes.filter((c) => c.area_m2 >= 0.5 || c.source === 'user').slice(0, 60);
  const rows = shown.map((c) => {
    const list = c.kind === 'tag' ? mapping.tags : mapping.materials;
    const measured = Object.entries(c.by || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${BUCKET_LABELS[k] || k} ${fmt2(v)}`)
      .join(' · ');
    const select = roleSelect(MAP_ROLES, list[c.name] || (c.role === 'auto' ? 'auto' : c.role), (r) => {
      if (r === 'auto') delete list[c.name];
      else list[c.name] = r;
      save();
    });
    const cell = el('div');
    cell.appendChild(el('div', c.name === 'Unpainted' ? 'map-check' : 'u-name',
      (c.kind === 'tag' ? 'Tag: ' : '') + c.name + (c.source === 'user' ? ' ✓' : '')));
    cell.appendChild(el('div', 'u-sub', measured + ' m²'));
    return [[cell, ''], [select, 'num']];
  });
  box.appendChild(takeoffTable([['Material / tag · measured as'], ['Role', 'num']], rows));

  // What was left out, and why.
  const ex = data.excluded || {};
  const out = [];
  const names = (g) => ((g && g.names) || []).slice(0, 5).map((n) => n.name).join(', ');
  if (ex.furniture && ex.furniture.count) out.push(`${ex.furniture.count} furniture / people (${names(ex.furniture)}…)`);
  if (ex.frame && (ex.frame.members || ex.frame.panels)) {
    out.push(`timber/steel frame: ${ex.frame.members} members, ${fmt2(ex.frame.length_m)} m, ` +
      `${fmt2(ex.frame.volume_m3)} m³` + (ex.frame.panels ? `, ${ex.frame.panels} truss panels` : '') +
      ' (roof structure is priced per m² of roof)');
  }
  if (ex.other_components && ex.other_components.count) {
    out.push(`${ex.other_components.count} other components (${names(ex.other_components)}…): ` +
      'mark one as Door or Window if it is one');
  }
  if (ex.marked_ignore && ex.marked_ignore.count) out.push(`${ex.marked_ignore.count} marked Ignore`);
  const areas = ex.area_m2 || {};
  Object.keys(areas).filter((k) => areas[k] >= 0.5).forEach((k) => out.push(`${BUCKET_LABELS[k] || k} ${fmt2(areas[k])} m²`));
  if (out.length) box.appendChild(el('p', 'usage-note', 'Left out: ' + out.join('; ') + '.'));
  body.appendChild(box);
}

function fmt2(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function takeoffTable(head, rows) {
  const table = el('table', 'usage-table');
  const thead = el('thead');
  const tr = el('tr');
  head.forEach(([label, cls]) => tr.appendChild(el('th', cls || '', label)));
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach((cells) => {
    const row = el('tr', cells.className || '');
    cells.forEach(([text, cls]) => {
      if (text instanceof Node) {
        const td = el('td', cls || '');
        td.appendChild(text);
        row.appendChild(td);
      } else {
        row.appendChild(el('td', cls || '', text));
      }
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  return table;
}

window.diroryTakeoff = function (data) {
  lastTakeoff = data;
  byId('rabBox').hidden = false;
  if (typeof renderRab === 'function' && rabBook) renderRab();
  const body = byId('takeoffBody');
  body.innerHTML = '';
  byId('takeoffRun').disabled = false;
  byId('takeoffRun').textContent = '⟳ Measure again';
  const rows = data.rows || [];
  const openings = data.openings || [];
  const structure = data.structure || [];
  const mep = data.mep || [];
  const demolition = data.demolition || [];
  byId('rabConcrete').hidden = !structure.some((s) => s.concrete_m3 > 0);
  // Revit phases: price one of them (the host remembers the choice).
  const phases = data.phases || [];
  const phaseSelect = byId('rabPhase');
  phaseSelect.hidden = phases.length < 2;
  phaseSelect.innerHTML = '';
  phases.forEach((p) => {
    const option = el('option', '', `Phase: ${p.name}`);
    option.value = p.id;
    option.selected = p.id === data.phase;
    phaseSelect.appendChild(option);
  });
  const landscape = data.landscape || [];
  renderMapping(body, data);
  if (!rows.length && !openings.length && !structure.length && !mep.length && !demolition.length && !landscape.length) {
    body.appendChild(el('p', 'usage-note',
      'Nothing to measure: draw walls and slabs as raw geometry or groups. Faces inside components are treated as furniture.'));
    byId('takeoffExport').hidden = true;
    return;
  }

  ['wall', 'floor', 'ceiling', 'roof'].forEach((element) => {
    const list = rows.filter((r) => r.element === element);
    if (!list.length) return;
    const lines = list.map((r) => {
      const line = [
        [r.material + (r.brand ? ` · ${r.brand}` : ''), r.dirory ? 'u-name' : ''],
        [fmt2(r.area_m2) + ' m²', 'num'],
      ];
      return line;
    });
    const total = [['Total', ''], [fmt2((data.totals || {})[element]) + ' m²', 'num']];
    total.className = 'total';
    lines.push(total);
    body.appendChild(el('h4', 'takeoff-element', ELEMENT_LABELS[element]));
    body.appendChild(takeoffTable([['Material'], ['Area', 'num']], lines));
  });

  if (landscape.length) {
    body.appendChild(el('h4', 'takeoff-element', ELEMENT_LABELS.site));
    body.appendChild(takeoffTable([['Material'], ['Area', 'num']], landscape.map((r) => [
      [`${r.role === 'landscape_hard' ? 'Hardscape' : 'Softscape'}: ${r.material}`, ''],
      [fmt2(r.area_m2) + ' m²', 'num'],
    ])));
  }

  // Revit only: concrete, formwork and rebar per member, then steel.
  if (structure.length) {
    body.appendChild(el('h4', 'takeoff-element', ELEMENT_LABELS.structure));
    const labels = (window.DiroryRab && window.DiroryRab.MEMBER_LABELS) || {};
    const concrete = structure.filter((s) => s.concrete_m3 > 0).map((s) => [
      [`${labels[s.member] || s.member} · ${s.name} (${s.count})`, ''],
      [fmt2(s.concrete_m3) + ' m³', 'num'],
      [fmt2(s.formwork_m2) + ' m²', 'num'],
      [s.rebar_kg > 0 ? fmt2(s.rebar_kg) + ' kg' : 'estimated', 'num'],
    ]);
    if (concrete.length) {
      body.appendChild(takeoffTable([['Member'], ['Concrete', 'num'], ['Formwork', 'num'], ['Rebar', 'num']], concrete));
    }
    const steel = structure.filter((s) => s.steel_kg > 0).map((s) => [
      [`${s.name} (${s.count})`, ''],
      [fmt2(s.steel_kg) + ' kg', 'num'],
    ]);
    if (steel.length) body.appendChild(takeoffTable([['Steel member'], ['Weight', 'num']], steel));
  }

  // What the priced phase demolishes (Revit) or the "Bongkar" tag holds (SketchUp).
  if (demolition.length) {
    body.appendChild(el('h4', 'takeoff-element', ELEMENT_LABELS.demolition));
    body.appendChild(takeoffTable([['Element'], ['Quantity', 'num']], demolition.map((d) => [
      [`${d.group.replace(/_/g, ' ')}: ${d.name}`, ''],
      [`${d.unit === 'unit' ? d.quantity : fmt2(d.quantity)} ${d.unit === 'unit' ? '' : d.unit}`.trim(), 'num'],
    ])));
  }

  // Revit only: pipe and duct runs, fixtures and devices.
  if (mep.length) {
    const GROUPS = {
      pipe: 'Pipe', duct: 'Duct', cable_tray: 'Cable tray', plumbing_fixture: 'Plumbing fixture', light: 'Light',
      switch: 'Switch', socket: 'Socket', panel: 'Panel', equipment: 'Equipment', air_terminal: 'Air terminal',
      sprinkler: 'Sprinkler', fire_alarm: 'Fire alarm',
    };
    body.appendChild(el('h4', 'takeoff-element', ELEMENT_LABELS.mep));
    body.appendChild(takeoffTable([['Item'], ['Quantity', 'num']], mep.map((m) => {
      const detail = m.group === 'pipe'
        ? [m.system, m.material, m.size_mm ? `Ø${m.size_mm} mm` : ''].filter(Boolean).join(' · ')
        : '';
      return [
        [`${GROUPS[m.group] || m.group}: ${m.name}${detail ? ` (${detail})` : ''}`, ''],
        [`${m.unit === 'unit' ? m.quantity : fmt2(m.quantity)} ${m.unit === 'unit' ? '' : m.unit}`.trim(), 'num'],
      ];
    })));
  }

  if (openings.length) {
    body.appendChild(el('h4', 'takeoff-element', 'Doors & windows (kusen, pintu, jendela)'));
    body.appendChild(takeoffTable(
      [['Item'], ['W × H', 'num'], ['Qty', 'num']],
      openings.map((o) => [
        [`${o.name} (${o.kind})`, ''],
        [`${fmt2(o.width_m)} × ${fmt2(o.height_m)} m`, 'num'],
        [String(o.count), 'num'],
      ]),
    ));
  }

  // A host can describe its own measuring rules (the Revit add-in does).
  const notes = Array.isArray(data.notes) ? data.notes.slice() : [];
  if (!Array.isArray(data.notes) && data.floor_perimeter_m > 0) {
    notes.push(`Floor perimeter (for skirting, approx.): ${fmt2(data.floor_perimeter_m)} m¹.`);
  }
  if (!Array.isArray(data.notes)) notes.push('Wall areas are finish areas per side (paint, plaster, tiles); openings are already deducted.');
  if (data.components_skipped && !data.excluded) {
    notes.push(`${data.components_skipped} component(s) were not measured (furniture and products). ` +
      'Draw walls, slabs and roofs as groups so they are counted.');
  }
  if (!Array.isArray(data.notes)) notes.push('An estimate from the model: check it before a tender.');
  if (Array.isArray(data.notes) && data.floor_perimeter_m > 0) {
    notes.unshift(`Floor perimeter (for skirting): ${fmt2(data.floor_perimeter_m)} m¹.`);
  }
  body.appendChild(el('p', 'usage-note', notes.join(' ')));
  byId('takeoffExport').hidden = false;
};

byId('takeoffRun').addEventListener('click', () => {
  byId('takeoffRun').disabled = true;
  byId('takeoffRun').textContent = 'Measuring…';
  sketchup.requestTakeoff();
});
byId('takeoffExport').addEventListener('click', () => sketchup.exportTakeoff());

/* ------------------------------------------------------------------ */
/* RAB: takeoff x regional price book (rab.js does the arithmetic)      */
/* ------------------------------------------------------------------ */

let lastTakeoff = null;
let rabBook = null;      // the book in the chosen city's prices
let rabBookRaw = null;   // as served: DKI Jakarta prices
let rabAccess = null;    // { pro, free_used, free_limit } from the rab function

/* Project location: the city whose prices the RAB uses. Jakarta's book x
   IKK(city) / IKK(DKI Jakarta), BPS Indeks Kemahalan Konstruksi 2025. */
const CITY_PREF = 'dirory.city';
const IKK_DATA = window.DiroryIKK || null;

function selectedCity() {
  const code = byId('rabCity') ? byId('rabCity').value : '';
  return code && IKK_DATA ? IKK_DATA.cities.find((c) => c.code === code) || null : null;
}

function forCity(book) {
  return window.DiroryRab.bookForCity(book, selectedCity(), IKK_DATA);
}

(function fillCities() {
  const select = byId('rabCity');
  if (!select) return;
  const first = el('option', '', 'DKI Jakarta (official Jakarta prices)');
  first.value = '';
  select.appendChild(first);
  if (IKK_DATA) {
    const byProvince = new Map();
    IKK_DATA.cities.forEach((c) => {
      if (!byProvince.has(c.province)) byProvince.set(c.province, []);
      byProvince.get(c.province).push(c);
    });
    byProvince.forEach((list, province) => {
      const group = document.createElement('optgroup');
      group.label = province;
      list.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => {
        const o = el('option', '', `${c.name.replace(/^Kota Administrasi /, 'Kota ')} (IKK ${String(c.ikk).replace('.', ',')})`);
        o.value = c.code;
        group.appendChild(o);
      });
      select.appendChild(group);
    });
  }
  try { select.value = localStorage.getItem(CITY_PREF) || ''; } catch (e) { /* default: Jakarta */ }
  select.addEventListener('change', () => {
    try { localStorage.setItem(CITY_PREF, select.value); } catch (e) { /* this session only */ }
    if (rabBookRaw) rabBook = forCity(rabBookRaw);
    if (liveBookRaw) {
      const pro = liveBook && liveBook.pro;
      liveBook = Object.assign(forCity(liveBookRaw), { pro: pro || liveBookRaw.pro });
      byId('liveCostRegion').textContent = `· ${liveBook.name}`;
    }
    if (rabBook && lastTakeoff) renderRab();
    renderLive();
  });
})();
let lastRab = null;
const RAB_ELEMENT_LABELS = Object.assign({}, ELEMENT_LABELS, { opening: 'Doors & windows (kusen, pintu, jendela)' });

function rupiah(n) {
  return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
}

function rabOptions() {
  return {
    wallType: byId('rabWall').value,
    wallsBothSides: byId('rabBothSides').checked,
    concrete: byId('rabConcrete').value,
    prices: customPrices,
  };
}

function renderRab() {
  const body = byId('rabBody');
  body.innerHTML = '';
  if (!lastTakeoff || !rabBook) return;
  lastRab = window.DiroryRab.computeRab(lastTakeoff, rabBook, rabOptions());
  if (!lastRab.lines.length) {
    body.appendChild(el('p', 'usage-note', 'Nothing to price yet: measure a model with walls, floors, ceilings, roofs or structure.'));
    return;
  }
  window.DiroryRab.ELEMENTS.forEach((element) => {
    const lines = lastRab.lines.filter((l) => l.element === element);
    if (!lines.length) return;
    body.appendChild(el('h4', 'takeoff-element', RAB_ELEMENT_LABELS[element] || element));
    const rows = lines.map((l) => {
      const row = [
        [lineName(l), ''],
        [`${fmt2(l.quantity)} ${l.unit}`, 'num'],
        [priceInput(l), 'num'],
        [l.needs_price ? '—' : rupiah(l.amount), 'num'],
      ];
      if (l.needs_price) row.className = 'needs-price';
      return row;
    });
    const sub = [['Subtotal', ''], ['', ''], ['', ''], [rupiah(lastRab.subtotals[element]), 'num']];
    sub.className = 'total';
    rows.push(sub);
    body.appendChild(takeoffTable([['Work item'], ['Volume', 'num'], ['Unit price', 'num'], ['Amount', 'num']], rows));
  });
  if (lastRab.unpriced) {
    body.appendChild(el('p', 'rab-unpriced',
      `${lastRab.unpriced} line(s) have no price yet and are not in the total: type the unit price from your quote in the highlighted rows.`));
  }
  const total = el('p', 'rab-total');
  total.appendChild(el('span', '', 'Estimated total'));
  total.appendChild(el('strong', '', rupiah(lastRab.total)));
  body.appendChild(total);
  const note = [
    `Unit prices: ${rabBook.name}, AHSP coefficients with regional basic prices, including ${rabBook.overhead_pct}% overhead and profit. Excludes PPN.`,
    rabBook.source ? `Source: ${rabBook.source}` : '',
    rebarNote(),
    rabAccess && !rabAccess.pro && rabAccess.free_limit
      ? `Free estimate: ${rabAccess.free_used} of ${rabAccess.free_limit} used (this project counts once). After that, more estimates need Dirory Pro.`
      : '',
    lastRab.lines.some((l) => !l.custom && /^Market estimate/.test(l.reference))
      ? 'Split AC units have no AHSP analysis: they are market estimates (retail listings, mid-2026, unit plus installation). Type your quote over them.'
      : '',
    'An estimate from the model, not a tender document. Check volumes and specifications with your quantity surveyor.',
  ].filter(Boolean).join(' ');
  body.appendChild(el('p', 'usage-note', note));
  const actions = el('div', 'usage-actions');
  const print = el('button', 'ghost-btn', '🖨 Print RAB');
  print.addEventListener('click', printRab);
  const csv = el('button', 'ghost-btn', '⭳ Export RAB (CSV)');
  csv.addEventListener('click', exportRabCsv);
  const xlsx = el('button', 'ghost-btn', '⭳ Export RAB (Excel)');
  xlsx.title = 'REKAP, RAB, AHS per discipline, basic prices and volumes, linked by formulas';
  xlsx.addEventListener('click', exportRabXlsx);
  actions.appendChild(print);
  actions.appendChild(xlsx);
  actions.appendChild(csv);
  body.appendChild(actions);
}

// The architect's own unit prices, by RAB line id. Kept by the host (SketchUp
// defaults / the Revit add-in's settings), so they survive a restart.
let customPrices = {};
let customPricesLoaded = false;

window.diroryPrices = function (prices) {
  customPrices = prices && typeof prices === 'object' ? prices : {};
  customPricesLoaded = true;
  if (lastTakeoff && rabBook) renderRab();
  renderLive();
};

function lineName(l) {
  return (l.section ? `${l.section}: ` : '') + l.name + (l.custom ? ' (your price)' : '');
}

// The unit price as a box the architect can type over. Clearing it goes back
// to the price book.
function priceInput(l) {
  const input = el('input', 'price-input' + (l.custom ? ' custom' : ''));
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = l.needs_price ? '' : String(l.unit_price);
  input.placeholder = l.needs_price ? 'Enter price' : '';
  input.title = l.needs_price ? 'No price in the book: type your unit price (Rp)' : 'Type your own unit price (Rp); clear it to use the book price';
  input.setAttribute('aria-label', `Unit price for ${l.name}`);
  input.addEventListener('change', () => {
    const digits = input.value.replace(/[^\d]/g, '');
    if (digits) customPrices[l.id] = Number(digits);
    else delete customPrices[l.id];
    try { sketchup.savePrices(JSON.stringify(customPrices)); } catch (e) { /* kept for this session */ }
    renderRab();
    renderLive();
  });
  return input;
}

// Members with no modelled rebar are priced with a kg per m3 ratio; say so.
function rebarNote() {
  const rab = window.DiroryRab;
  const used = ((lastTakeoff && lastTakeoff.structure) || []).filter((s) => s.rebar_ratio_m3 > 0);
  if (!used.length) return '';
  const members = Array.from(new Set(used.map((s) => s.member)));
  const ratios = members.map((m) => `${(rab.MEMBER_LABELS[m] || m).toLowerCase()} ${rab.REBAR_RATIO[m]} kg/m³`).join(', ');
  return `Rebar is not modelled in some members, so it is estimated per m³ of concrete: ${ratios}. Model the rebar in Revit for the real weight.`;
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function printRab() {
  if (!lastRab) return;
  const sections = window.DiroryRab.ELEMENTS.map((element) => {
    const lines = lastRab.lines.filter((l) => l.element === element);
    if (!lines.length) return '';
    const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(lineName(l))}<div class="ref">${escapeHtml(l.custom ? 'Price entered by the architect' : l.reference)}</div></td>` +
      `<td class="num">${fmt2(l.quantity)}</td><td>${escapeHtml(l.unit)}</td>` +
      `<td class="num">${l.needs_price ? 'not priced' : rupiah(l.unit_price)}</td><td class="num">${l.needs_price ? '—' : rupiah(l.amount)}</td></tr>`).join('');
    return `<h2>${escapeHtml(RAB_ELEMENT_LABELS[element] || element)}</h2><table><thead><tr><th>#</th><th>Uraian pekerjaan</th>` +
      `<th>Volume</th><th>Sat.</th><th>Harga satuan</th><th>Jumlah</th></tr></thead><tbody>${rows}` +
      `<tr class="sub"><td></td><td>Subtotal</td><td></td><td></td><td></td><td class="num">${rupiah(lastRab.subtotals[element])}</td></tr></tbody></table>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>RAB - ${escapeHtml(rabBook.name)}</title><style>
    body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #1c1c1e; margin: 24px; }
    h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 20px 0 6px; color: #39509f; }
    .meta, .ref { color: #6b6b70; } .ref { font-size: 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d7d9e6; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f4f5f9; } .num { text-align: right; white-space: nowrap; }
    tr.sub td { font-weight: 700; background: #f4f5f9; }
    .total { margin-top: 18px; font-size: 15px; text-align: right; }
    @media print { body { margin: 0; } button { display: none; } }
  </style></head><body><button onclick="window.print()" style="float:right">Print / Save as PDF</button>
  <h1>Rencana Anggaran Biaya (estimate)</h1>
  <p class="meta">${escapeHtml(rabBook.name)} · ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · Dirory</p>
  ${sections}
  <p class="total">Estimated total: <strong>${rupiah(lastRab.total)}</strong></p>
  ${lastRab.unpriced ? `<p class="meta">${lastRab.unpriced} line(s) are not priced and not in the total.</p>` : ''}
  <p class="meta">Includes ${rabBook.overhead_pct}% overhead and profit; excludes PPN. ${escapeHtml(rabBook.source || '')} ${escapeHtml(rebarNote())}
  Volumes are measured from the model; check them before a tender.</p></body></html>`;
  sketchup.printHtml(JSON.stringify({ name: 'Dirory_RAB', html: html }));
}

// The RAB as an Excel workbook (rab-xlsx.js): REKAP, RAB, AHS per discipline,
// HARGA UPAH BAHAN, VOL and CATATAN, linked by formulas. Built here; the host
// only saves the bytes.
function exportRabXlsx() {
  if (!lastRab || !rabBook) return;
  try {
    const project = (lastTakeoff && lastTakeoff.project) || '';
    const workbook = window.DiroryRabXlsx.buildRabWorkbook({
      rab: lastRab,
      book: rabBook,
      takeoff: lastTakeoff,
      project: project,
      labels: {},
      notes: [rebarNote()].filter(Boolean),
    });
    const bytes = window.DiroryXlsx.write(workbook);
    const safe = (project || 'Dirory').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Dirory';
    sketchup.saveBinary(JSON.stringify({
      title: 'Export RAB (Excel)',
      filename: `RAB_${safe}.xlsx`,
      base64: window.DiroryXlsx.toBase64(bytes),
    }));
  } catch (e) {
    window.diroryToast(`Could not build the Excel file: ${e.message}`);
  }
}

function exportRabCsv() {
  if (!lastRab) return;
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [['Element', 'Work item', 'Volume', 'Unit', 'Unit price (IDR)', 'Amount (IDR)', 'Reference']];
  lastRab.lines.forEach((l) => rows.push([RAB_ELEMENT_LABELS[l.element] || l.element, lineName(l), l.quantity, l.unit,
    l.needs_price ? '' : l.unit_price, l.needs_price ? '' : l.amount, l.custom ? 'Price entered by the architect' : l.reference]));
  rows.push(['', 'Estimated total', '', '', '', lastRab.total, '']);
  const content = rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  sketchup.saveText(JSON.stringify({ title: 'Export RAB', filename: 'Dirory_RAB.csv', content: content }));
}

window.diroryRabBook = function (book) {
  rabBookRaw = book;
  rabBook = forCity(book);
  rabAccess = (book && book.access) || null;
  // With Pro (or this project's free BoQ) the live strip can open the breakdown.
  if (liveBook && !liveBook.pro && rabAccess && rabAccess.pro) {
    liveBook.pro = true;
    byId('liveCostDetails').textContent = 'Breakdown';
    byId('liveCostDetails').title = 'Open the itemised RAB';
  }
  if (!customPricesLoaded) {
    try { sketchup.loadPrices(); } catch (e) { /* an older host keeps no prices */ }
  }
  byId('rabRun').disabled = false;
  byId('rabRun').textContent = '💰 Estimate cost (RAB)';
  renderRab();
};

// The estimate needs Dirory Pro: explain and offer the payment page.
window.diroryRabUpgrade = function (url) {
  byId('rabRun').disabled = false;
  byId('rabRun').textContent = '💰 Estimate cost (RAB)';
  const body = byId('rabBody');
  body.innerHTML = '';
  const box = el('div', 'consent-needed');
  box.appendChild(el('p', '', 'You have used your 2 free cost estimates (RAB / BoQ). More estimates are part of Dirory Pro: ' +
    'Rp 99.000 a month, or Rp 49.000 for one project. Pay with QRIS, then click Estimate cost again.'));
  const go = el('button', 'primary-btn', '⭐ Get Dirory Pro');
  go.addEventListener('click', () => sketchup.openURL(JSON.stringify({ url: url || 'https://dirory.com/pro' })));
  box.appendChild(go);
  body.appendChild(box);
};

window.diroryRabError = function (message) {
  byId('rabRun').disabled = false;
  byId('rabRun').textContent = '💰 Estimate cost (RAB)';
  byId('rabBody').innerHTML = '';
  byId('rabBody').appendChild(el('p', 'usage-note', message));
};

byId('rabRun').addEventListener('click', () => {
  const region = byId('rabRegion').value;
  // Pro: reuse the book. Otherwise ask again, so the server can count a free
  // estimate per project (the same project again is not counted twice).
  if (rabBook && rabBook.region === region && rabAccess && rabAccess.pro) {
    renderRab();
    return;
  }
  byId('rabRun').disabled = true;
  byId('rabRun').textContent = 'Loading prices…';
  sketchup.requestRab(JSON.stringify({ region: region }));
});
['rabWall', 'rabConcrete', 'rabBothSides'].forEach((id) => byId(id).addEventListener('change', () => {
  if (rabBook) renderRab();
  renderLive();
}));
byId('rabPhase').addEventListener('change', () => {
  sketchup.requestTakeoff(JSON.stringify({ phase: byId('rabPhase').value }));
});

/* ------------------------------------------------------------------ */
/* Live cost: the model's estimated total, updated as it changes        */
/* ------------------------------------------------------------------ */
//
// Signed-in architects get a slim price list (`rab?live=1`: unit prices
// only). The host re-measures the model a moment after each change and sends
// the takeoff here (diroryLiveTakeoff); rab.js prices it in the panel, so the
// quantities never leave the computer. The total is for everyone; the
// itemised RAB - breakdown, print, CSV, own prices - is Dirory Pro.

let liveBook = null;
let liveBookRaw = null;
let liveTakeoff = null;
let liveRequested = false;
const LIVE_PREF = 'dirory.liveCost';

function liveWanted() {
  try { return localStorage.getItem(LIVE_PREF) !== 'off'; } catch (e) { return true; }
}

function showLive(on) {
  byId('liveCost').hidden = !on;
  document.body.classList.toggle('has-live-cost', on);
}

function startLive() {
  if (liveRequested || !account.signedIn || !liveWanted()) return;
  liveRequested = true;
  try { sketchup.requestLiveBook(JSON.stringify({ region: byId('rabRegion').value || 'jakarta' })); } catch (e) { liveRequested = false; }
}

function stopLive() {
  liveRequested = false;
  liveBook = null;
  showLive(false);
  try { sketchup.setLive(JSON.stringify({ on: false })); } catch (e) { /* older host */ }
}

window.diroryLiveBook = function (book) {
  if (!book || !Array.isArray(book.items)) {
    liveBook = null;
    liveBookRaw = null;
    showLive(false);
    return;
  }
  liveBookRaw = book;
  liveBook = forCity(book);
  byId('liveCostRegion').textContent = `· ${liveBook.name}`;
  const freeLeft = !book.pro && (book.free_this_model || (book.free_used || 0) < (book.free_limit || 0));
  byId('liveCostDetails').textContent = book.pro ? 'Breakdown' : freeLeft ? 'Breakdown (free)' : 'Breakdown ⭐';
  byId('liveCostDetails').title = book.pro
    ? 'Open the itemised RAB'
    : freeLeft
      ? `Free estimates: ${book.free_used || 0} of ${book.free_limit} used. This project counts once.`
      : 'You have used your free estimates: the itemised RAB is part of Dirory Pro';
  byId('liveCostTotal').textContent = 'Measuring…';
  showLive(true);
  byId('liveCost').classList.add('updating');
  sketchup.setLive(JSON.stringify({ on: true }));
};

window.diroryLiveTakeoff = function (data) {
  liveTakeoff = data;
  renderLive();
  // Keep an open Quantities / RAB view in step with the model too.
  if (lastTakeoff) window.diroryTakeoff(data);
};

function renderLive() {
  if (!liveBook || !liveTakeoff) return;
  const rab = window.DiroryRab.computeRab(liveTakeoff, liveBook, rabOptions());
  byId('liveCostTotal').textContent = rupiah(rab.total);
  const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  byId('liveCostNote').textContent = [
    `updated ${time}`,
    rab.unpriced ? `${rab.unpriced} item(s) without a price` : '',
    'excl. PPN',
  ].filter(Boolean).join(' · ');
  byId('liveCost').classList.remove('updating');
}

byId('liveCostDetails').addEventListener('click', () => {
  const usageTab = document.querySelector('.tab-usage');
  if (usageTab && currentFilter !== 'usage') usageTab.click();
  if (liveTakeoff) window.diroryTakeoff(liveTakeoff);
  // Pro gets the itemised RAB; anyone else gets the upgrade offer (402).
  byId('rabRun').click();
  byId('rabBox').scrollIntoView({ block: 'start' });
});

byId('liveCostClose').addEventListener('click', () => {
  try { localStorage.setItem(LIVE_PREF, 'off'); } catch (e) { /* hidden for this session only */ }
  byId('rabLive').checked = false;
  stopLive();
});

byId('rabLive').checked = liveWanted();
byId('rabLive').addEventListener('change', () => {
  const on = byId('rabLive').checked;
  try { localStorage.setItem(LIVE_PREF, on ? 'on' : 'off'); } catch (e) { /* this session only */ }
  if (on) startLive();
  else stopLive();
});

/* ------------------------------------------------------------------ */
/* Product info + Inspector                                            */
/* ------------------------------------------------------------------ */

function detailRow(label, value) {
  if (value === undefined || value === null || value === '') return null;
  const row = el('div', 'product-row');
  row.appendChild(el('span', 'product-label', label));
  row.appendChild(el('span', 'product-value', String(value)));
  return row;
}

function renderProductBody(container, item, onAction) {
  container.innerHTML = '';
  if (item.thumbnail_url || item.thumbnail) {
    const img = document.createElement('img');
    img.className = 'product-image';
    img.src = item.thumbnail_url || (/^https?:/i.test(item.thumbnail) ? item.thumbnail : 'file:///' + item.thumbnail.replace(/\\/g, '/'));
    img.onerror = () => img.remove();
    container.appendChild(img);
  }
  const rows = [
    detailRow(t('product.name'), item.name),
    detailRow(t('product.brand'), item.brand),
    detailRow(t('product.category'), item.category),
    detailRow(t('product.type'), item.type === 'material' ? t('product.type.material') : t('product.type.model')),
    detailRow(t('product.tile_size'), item.tile_size_cm && item.tile_size_cm.length ? item.tile_size_cm.join(' × ') + ' cm' : (item.tile_size || '')),
    detailRow(t('product.dimensions'), item.dimensions),
    detailRow(t('product.sketchup'), item.su_version ? t('product.sketchup_or_later', { version: item.su_version }) : ''),
    detailRow(t('product.tags'), Array.isArray(item.tags) ? item.tags.join(', ') : item.tags),
    detailRow(t('product.sku'), item.sku),
    detailRow(t('product.url'), item.product_url),
  ].filter(Boolean);
  rows.forEach((row) => container.appendChild(row));

  const actions = el('div', 'product-actions');
  if (item.product_url) {
    const open = el('button', 'ghost-btn', t('product.open_page'));
    open.type = 'button';
    open.addEventListener('click', () => sketchup.openURL(JSON.stringify({ url: item.product_url })));
    actions.appendChild(open);
  }
  if (item.brand && String(item.brand).toLowerCase() !== 'dirory') {
    const quote = el('button', 'ghost-btn', t('product.ask_quote'));
    quote.type = 'button';
    quote.addEventListener('click', () => {
      // Close whatever panel showed this detail view before opening the quote.
      if (typeof onAction === 'function') onAction();
      quoteBrands.clear();
      quoteBrands.add(item.brand);
      openQuote();
    });
    actions.appendChild(quote);
  }
  if (actions.children.length) container.appendChild(actions);
}

function openProductInfo(item) {
  byId('productTitle').textContent = item.name;
  renderProductBody(byId('productBody'), item, closeProductInfo);
  byId('productModal').hidden = false;
}

function closeProductInfo() {
  byId('productModal').hidden = true;
}

byId('productClose').addEventListener('click', closeProductInfo);
byId('productModal').addEventListener('click', (e) => {
  if (e.target === byId('productModal')) closeProductInfo();
});

function openInspector() {
  byId('inspectorModal').hidden = false;
  sketchup.inspectSelection();
}

function closeInspector() {
  byId('inspectorModal').hidden = true;
}

byId('inspectorClose').addEventListener('click', closeInspector);
byId('inspectorModal').addEventListener('click', (e) => {
  if (e.target === byId('inspectorModal')) closeInspector();
});
byId('inspectorBtn').addEventListener('click', openInspector);

// Ruby pushes the details of the selected entity (or null when nothing Dirory
// is selected).
window.diroryInspect = function (data) {
  const body = byId('inspectorBody');
  if (!data || !data.found) {
    body.innerHTML = '';
    body.appendChild(el('p', 'product-empty', t('inspector.nothing')));
    return;
  }
  renderProductBody(body, data.item, closeInspector);
  byId('inspectorTitle').textContent = data.item.name || 'Inspector';
};
