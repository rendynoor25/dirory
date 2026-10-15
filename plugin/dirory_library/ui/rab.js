/* Dirory — RAB (Rencana Anggaran Biaya) calculator.
 *
 * Pure: takes the quantity takeoff (takeoff.rb, or Takeoff.cs in Revit) and a regional price book
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
 *
 * Structure (Revit only; takeoff.structure, see StructureTakeoff.cs), per
 * member - footing, tie_beam (sloof), column, beam, slab, wall:
 *   concrete_<m>       concrete volume (m3)
 *   formwork_<m>       formwork contact area (m2)
 *   rebar_<m>          modelled rebar (kg) plus, for members with no modelled
 *                      rebar, concrete volume x REBAR_RATIO (kg/m3)
 *   concrete           all structural concrete (compaction)
 *   steel              structural steel weight (kg)
 * A wall row with core = 'concrete' is a concrete wall: its finishes are
 * priced, its core is not priced again as masonry.
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

  // Structure lines are per member, in the order an RAB lists them.
  const MEMBERS = ['footing', 'tie_beam', 'column', 'beam', 'slab', 'wall'];
  const MEMBER_LABELS = {
    footing: 'Footings (pondasi)',
    tie_beam: 'Sloof',
    column: 'Columns (kolom)',
    beam: 'Beams (balok)',
    slab: 'Slabs (plat lantai)',
    wall: 'Concrete walls (dinding beton)',
  };
  // Rebar where none is modelled, kg per m3 of concrete. Planning ratios for
  // ordinary low- to mid-rise buildings in Indonesia, not from AHSP: model the
  // rebar in Revit, or pass options.rebarRatio, for a real figure.
  const REBAR_RATIO = { footing: 90, tie_beam: 130, column: 180, beam: 160, slab: 110, wall: 120 };

  const ELEMENTS = ['structure', 'wall', 'floor', 'ceiling', 'roof', 'opening'];

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
    const masonry = sum((r) => r.element === 'wall' && r.core !== 'concrete');
    const tiled = sum((r) => r.element === 'wall' && isTiled(r));
    const openings = (takeoff && takeoff.openings) || [];
    const perimeter = openings.reduce((s, x) => s + 2 * ((x.width_m || 0) + (x.height_m || 0)) * (x.count || 0), 0);
    const area = (kind) =>
      openings.filter((x) => x.kind === kind).reduce((s, x) => s + (x.width_m || 0) * (x.height_m || 0) * (x.count || 0), 0);
    return Object.assign({
      wall_core: round2(o.wallsBothSides ? masonry / 2 : masonry),
      wall_finish: round2(wall - tiled),
      wall_tiled: round2(tiled),
      floor: round2(sum((r) => r.element === 'floor')),
      floor_perimeter: round2((takeoff && takeoff.floor_perimeter_m) || 0),
      ceiling: round2(sum((r) => r.element === 'ceiling')),
      roof: round2(sum((r) => r.element === 'roof')),
      opening_perimeter: round2(perimeter),
      door_area: round2(area('door')),
      window_area: round2(area('window')),
    }, structureQuantities(takeoff, o));
  }

  function structureQuantities(takeoff, o) {
    const rows = (takeoff && takeoff.structure) || [];
    const ratio = Object.assign({}, REBAR_RATIO, (o && o.rebarRatio) || {});
    const q = { concrete: 0, steel: 0 };
    MEMBERS.forEach((m) => {
      const mine = rows.filter((r) => r.member === m);
      const total = (field) => mine.reduce((s, r) => s + (Number(r[field]) || 0), 0);
      q['concrete_' + m] = round2(total('concrete_m3'));
      q['formwork_' + m] = round2(total('formwork_m2'));
      q['rebar_' + m] = round2(total('rebar_kg') + total('rebar_ratio_m3') * (ratio[m] || 0));
      q.concrete += q['concrete_' + m];
    });
    q.concrete = round2(q.concrete);
    q.steel = round2(rows.reduce((s, r) => s + (Number(r.steel_kg) || 0), 0));
    return q;
  }

  // Concrete, formwork and rebar for each member, then compaction and steel.
  function structureLines(o) {
    const concrete = o.concrete === 'site' ? 'concrete_site' : 'concrete_rm';
    const specs = [];
    MEMBERS.forEach((m) => {
      const label = MEMBER_LABELS[m];
      specs.push({ item: concrete, basis: 'concrete_' + m, prefix: label });
      specs.push({ item: m === 'slab' ? 'rebar_slab' : 'rebar_frame', basis: 'rebar_' + m, prefix: label });
      specs.push({ item: 'formwork_' + m, basis: 'formwork_' + m, prefix: label });
    });
    specs.push({ item: 'concrete_vibrate', basis: 'concrete' });
    specs.push({ item: 'steel_profile', basis: 'steel' });
    return specs.map((s) => Object.assign({ element: 'structure' }, s));
  }

  /**
   * computeRab(takeoff, book, options) ->
   *   { region, lines: [{element, key, name, basis, quantity, unit, unit_price, amount}],
   *     subtotals: {wall: n, ...}, total, missing: [item keys not in the book] }
   */
  function computeRab(takeoff, book, options) {
    const o = Object.assign({ wallType: 'brick', wallsBothSides: true, concrete: 'readymix' }, options || {});
    const q = quantities(takeoff, o);
    const items = new Map(((book && book.items) || []).map((it) => [it.key, it]));
    const lines = [];
    const missing = [];
    structureLines(o).concat(LINES).forEach((spec) => {
      if (spec.when && !spec.when(o)) return;
      const quantity = q[spec.basis] || 0;
      if (quantity <= 0) return;
      const it = items.get(spec.item);
      if (!it) {
        if (missing.indexOf(spec.item) < 0) missing.push(spec.item);
        return;
      }
      const unitPrice = Number(it.unit_price) || 0;
      lines.push({
        element: spec.element || it.element,
        key: spec.item,
        name: spec.label || (spec.prefix ? spec.prefix + ': ' + it.name : it.name),
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

  const api = {
    computeRab: computeRab,
    quantities: quantities,
    ELEMENTS: ELEMENTS,
    MEMBERS: MEMBERS,
    MEMBER_LABELS: MEMBER_LABELS,
    REBAR_RATIO: REBAR_RATIO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryRab = api;
})(typeof window !== 'undefined' ? window : this);
