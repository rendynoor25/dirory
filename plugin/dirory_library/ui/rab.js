/* Dirory — RAB (Rencana Anggaran Biaya) calculator.
 *
 * Pure: takes the quantity takeoff (takeoff.rb) and a regional price book
 * (the `rab` Edge Function), returns priced lines. No DOM, no SketchUp, so it
 * runs in the panel and under Node for tests (scripts/test-rab.mjs).
 *
 * How the takeoff becomes volumes:
 *   wall_core          masonry area = wall surfaces / 2 (a wall is drawn with
 *                      both faces), or the surfaces as-is for single-face walls
 *   wall_finish        plaster, skim coat, paint: every wall surface that is
 *                      not tiled
 *   wall_tiled         wall surfaces finished with a tile material
 *   floor              floor area
 *   floor_perimeter    skirting length (m')
 *   ceiling            ceiling area
 *   roof               roof area (true, slope included)
 *   opening_perimeter  frame length: 2 x (W + H) per door/window
 *   door_area          W x H per door
 *   window_area        W x H per window
 */
(function (root) {
  'use strict';

  const TILE_RE = /\b(tile|tiles|keramik|ceramic|granit|granite|porselen|porcelain|homogen\w*|mosaic|mozaik)\b/i;

  // One RAB line per (item, basis). Wall masonry is the only either/or.
  const LINES = [
    { item: 'wall_brick', basis: 'wall_core', when: (o) => o.wallType !== 'aac' },
    { item: 'wall_aac', basis: 'wall_core', when: (o) => o.wallType === 'aac' },
    { item: 'plaster', basis: 'wall_finish' },
    { item: 'skim_coat', basis: 'wall_finish' },
    { item: 'paint_wall', basis: 'wall_finish' },
    { item: 'wall_tile', basis: 'wall_tiled' },
    { item: 'floor_tile', basis: 'floor' },
    { item: 'skirting', basis: 'floor_perimeter' },
    { item: 'ceiling_frame', basis: 'ceiling' },
    { item: 'ceiling_gypsum', basis: 'ceiling' },
    { item: 'paint_wall', basis: 'ceiling', label: 'Ceiling paint (primer + 2 coats)', element: 'ceiling' },
    { item: 'roof_truss', basis: 'roof' },
    { item: 'roof_tile', basis: 'roof' },
    { item: 'frame_alu', basis: 'opening_perimeter' },
    { item: 'door_leaf', basis: 'door_area' },
    { item: 'glass', basis: 'window_area' },
  ];

  const ELEMENTS = ['wall', 'floor', 'ceiling', 'roof', 'opening'];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function isTiled(row) {
    return TILE_RE.test(String(row.category || '')) || TILE_RE.test(String(row.material || ''));
  }

  // Quantities per basis, from a takeoff.
  function quantities(takeoff, options) {
    const o = Object.assign({ wallsBothSides: true }, options || {});
    const rows = (takeoff && takeoff.rows) || [];
    const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (Number(r.area_m2) || 0), 0);
    const wall = sum((r) => r.element === 'wall');
    const tiled = sum((r) => r.element === 'wall' && isTiled(r));
    const openings = (takeoff && takeoff.openings) || [];
    const perimeter = openings.reduce((s, x) => s + 2 * ((x.width_m || 0) + (x.height_m || 0)) * (x.count || 0), 0);
    const area = (kind) =>
      openings.filter((x) => x.kind === kind).reduce((s, x) => s + (x.width_m || 0) * (x.height_m || 0) * (x.count || 0), 0);
    return {
      wall_core: round2(o.wallsBothSides ? wall / 2 : wall),
      wall_finish: round2(wall - tiled),
      wall_tiled: round2(tiled),
      floor: round2(sum((r) => r.element === 'floor')),
      floor_perimeter: round2((takeoff && takeoff.floor_perimeter_m) || 0),
      ceiling: round2(sum((r) => r.element === 'ceiling')),
      roof: round2(sum((r) => r.element === 'roof')),
      opening_perimeter: round2(perimeter),
      door_area: round2(area('door')),
      window_area: round2(area('window')),
    };
  }

  /**
   * computeRab(takeoff, book, options) ->
   *   { region, lines: [{element, key, name, basis, quantity, unit, unit_price, amount}],
   *     subtotals: {wall: n, ...}, total, missing: [item keys not in the book] }
   */
  function computeRab(takeoff, book, options) {
    const o = Object.assign({ wallType: 'brick', wallsBothSides: true }, options || {});
    const q = quantities(takeoff, o);
    const items = new Map(((book && book.items) || []).map((it) => [it.key, it]));
    const lines = [];
    const missing = [];
    LINES.forEach((spec) => {
      if (spec.when && !spec.when(o)) return;
      const quantity = q[spec.basis] || 0;
      if (quantity <= 0) return;
      const it = items.get(spec.item);
      if (!it) {
        missing.push(spec.item);
        return;
      }
      const unitPrice = Number(it.unit_price) || 0;
      lines.push({
        element: spec.element || it.element,
        key: spec.item,
        name: spec.label || it.name,
        basis: spec.basis,
        quantity: quantity,
        unit: it.unit,
        unit_price: Math.round(unitPrice),
        amount: Math.round(quantity * unitPrice),
        reference: it.reference || '',
      });
    });
    const subtotals = {};
    ELEMENTS.forEach((e) => {
      subtotals[e] = lines.filter((l) => l.element === e).reduce((s, l) => s + l.amount, 0);
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    return {
      region: book ? book.name : '',
      overhead_pct: book ? book.overhead_pct : null,
      quantities: q,
      lines: lines,
      subtotals: subtotals,
      total: total,
      missing: missing,
    };
  }

  const api = { computeRab: computeRab, quantities: quantities, ELEMENTS: ELEMENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryRab = api;
})(typeof window !== 'undefined' ? window : this);
