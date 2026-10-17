/* Dirory panel icons: one line style (24 x 24, 1.8 stroke, round caps), drawn
 * for Dirory, no icon font or network needed (the panel also runs offline in
 * SketchUp and Revit).
 *
 *   DiroryIcon.svg('download')       -> an <svg> element
 *   <button data-icon="download">    -> the icon is put in front of the label
 *   DiroryIcon.set(button, 'download', 'Export')  -> icon + text, safely
 */
(function (root) {
  'use strict';

  const PATHS = {
    library: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3.5" rx="0.5"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/><circle cx="12" cy="12" r="6.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-3.7 3.6-6 7.5-6s6.9 2.3 7.5 6"/>',
    upgrade: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-9M8 11.5l4-4 4 4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
    sheet: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 12h7M8.5 15.5h7M12 12v5.5"/>',
    csv: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h4.5"/>',
    printer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    dots: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.6v.4M12 17h.01"/>',
    ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M10.5 8v4M14 8v3M17.5 8v4"/>',
    building: '<path d="M4.5 20.5V6l8-2.5v17M12.5 8.5l7 2v10M3 20.5h18M8 8.5h1M8 12h1M8 15.5h1M15.5 13.5h1M15.5 17h1"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    sliders: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
    arrowRight: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    cart: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/><path d="M3 4h2.5l2.3 11h10.7l2-8H6.3"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.7 1.6-1.5 0-1.4-1.4-1.6-1.4-2.9 0-.9.7-1.5 1.8-1.5h2.2a4.3 4.3 0 0 0 4.3-4.3C20.5 6.6 16.8 3.5 12 3.5z"/><path d="M7.7 11.5h.01M9.5 7.6h.01M14.5 7.6h.01"/>',
    live: '<path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4"/>',
    edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M13 7l4 4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    closet: '<rect x="4.5" y="3" width="6.5" height="8" rx="1.2"/><path d="M7 5.8h1.5"/><path d="M3.5 11h16"/><path d="M19.5 11c0 3.7-2.9 6.4-6.8 6.5H7c-1.4 0-2.5-1.1-2.5-2.5V11"/><path d="M8.5 17.5 7.6 21h7.2l-.9-3.5"/>',
    paint: '<rect x="3.5" y="3.5" width="13.5" height="5.5" rx="1.5"/><path d="M17 6.2h2.5v5.3H11v3"/><rect x="9.5" y="14.5" width="3" height="6.5" rx="1"/>',
    boq: '<path d="M8 3.5h10.5a2 2 0 0 1 0 4H17"/><path d="M8 3.5a2 2 0 0 0-2 2v11"/><path d="M17 5.5v13a2 2 0 0 1-2 2H5.5a2 2 0 0 1 0-4H15"/><path d="M13.6 10.1c-.3-.7-1-1.1-1.9-1.1-1.1 0-1.9.6-1.9 1.4 0 1.8 3.9 1 3.9 2.9 0 .8-.8 1.4-2 1.4-.9 0-1.7-.4-2-1.1M11.7 7.9v1.1M11.7 14.7v1.1"/>',
    sparkle:'<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
  };

  const NS = 'http://www.w3.org/2000/svg';

  function svg(name, size) {
    const node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('class', 'ic ic-' + name);
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    if (size) {
      node.setAttribute('width', size);
      node.setAttribute('height', size);
    }
    node.innerHTML = PATHS[name] || '';
    return node;
  }

  // An icon followed by a text label; the label goes in as text, never HTML.
  function set(node, name, label) {
    node.textContent = '';
    if (name) node.appendChild(svg(name));
    if (label != null && label !== '') node.appendChild(document.createTextNode((name ? ' ' : '') + label));
    return node;
  }

  function hydrate(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach((node) => {
      if (node.querySelector(':scope > svg.ic')) return;
      node.insertBefore(svg(node.getAttribute('data-icon')), node.firstChild);
    });
  }

  root.DiroryIcon = { svg: svg, set: set, hydrate: hydrate, names: Object.keys(PATHS) };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
    else hydrate();
  }
})(typeof window !== 'undefined' ? window : this);
