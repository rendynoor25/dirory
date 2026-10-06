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
const DEFAULT_EMPTY_HTML =
  'No items found. Try another category or brand, or drop a <code>.skp</code> file ' +
  'anywhere inside your library folder and click \u27F3 to rescan.';

// Account: browsing and search are anonymous; insert, paint and quote need sign-in.
// shareProject is a separate, opt-in consent and defaults to off (v0.5.2).
let account = { signedIn: false, shareUsage: true, shareProject: false };
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

// The sticky Usage toolbar must sit right under the sticky search/tabs bar.
function trackControlsHeight() {
  const controls = document.getElementById('controls');
  const apply = () =>
    document.documentElement.style.setProperty('--controls-h', controls.offsetHeight + 'px');
  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(controls);
}

window.addEventListener('load', () => {
  trackControlsHeight();
  sketchup.ready();
  // If Ruby never calls back (e.g. an exception before send_library runs),
  // don't leave the panel silently blank — say so.
  setTimeout(() => {
    if (!heardFromRuby) {
      const diag = document.getElementById('diagnostic');
      diag.hidden = false;
      diag.textContent =
        "Didn't hear back from SketchUp. Open Window \u2192 Ruby Console, " +
        're-open this panel, and check for a red error message.';
    }
  }, 4000);
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

document.getElementById('usageRefresh').addEventListener('click', () => requestReport(true));
document.getElementById('usageExport').addEventListener('click', () => sketchup.exportReport());
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
  if (!account.shareUsage) return;
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
  document.getElementById('quoteBar').hidden = !usage;
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

  const filtered = allItems.filter((item) => {
    const matchesType = inCurrentTab(item);
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    const matchesBrand = !selectedBrand || item.brand === selectedBrand;
    return matchesType && matchesCategory && matchesBrand && (!q || matchesSearch(item, q));
  });

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
        q.length >= 3 && account.shareUsage
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
        asset_id: item.asset_id || '',
        version: item.version || 1,
        tile_size_cm: item.tile_size_cm || null,
        name: item.name,
        category: item.category || '',
        brand: item.brand || ''
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
  if (account.signedIn) {
    // Show who is signed in: the name, or the part of the email before "@".
    const label = (account.name || '').trim() || String(account.email || '').split('@')[0] || 'Account';
    btn.textContent = label;
    btn.title = `Signed in as ${account.name ? account.name + ' · ' : ''}${account.email || ''}`;
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
  if (btn) btn.hidden = !updateState.available;
  if (updateState.staged) {
    // An update is already downloaded and waiting for a restart.
    if (btn) btn.hidden = false;
    byId('settingsUpdateMsg').textContent = t('update.staged');
  }
};

window.diroryUpdateResult = function (result) {
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
  byId('settingsUpdateMsg').textContent = t('update.leading', {}) || '';
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
byId('privacyLink').addEventListener('click', (e) => {
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
    detailRow('Name', item.name),
    detailRow('Brand', item.brand),
    detailRow('Category', item.category),
    detailRow('Type', item.type === 'material' ? 'Material' : '3D model'),
    detailRow('Tile size', item.tile_size_cm && item.tile_size_cm.length ? item.tile_size_cm.join(' × ') + ' cm' : (item.tile_size || '')),
    detailRow('Tags', Array.isArray(item.tags) ? item.tags.join(', ') : item.tags),
    detailRow('SKU', item.sku),
    detailRow('Product URL', item.product_url),
  ].filter(Boolean);
  rows.forEach((row) => container.appendChild(row));

  const actions = el('div', 'product-actions');
  if (item.product_url) {
    const open = el('button', 'ghost-btn', 'Open product page ↗');
    open.type = 'button';
    open.addEventListener('click', () => sketchup.openURL(item.product_url));
    actions.appendChild(open);
  }
  if (item.brand && String(item.brand).toLowerCase() !== 'dirory') {
    const quote = el('button', 'ghost-btn', 'Ask this brand for a quote');
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
    body.appendChild(el('p', 'product-empty', 'Nothing Dirory is selected. Click a model or a painted surface, then open the Inspector again.'));
    return;
  }
  renderProductBody(body, data.item, closeInspector);
  byId('inspectorTitle').textContent = data.item.name || 'Inspector';
};
