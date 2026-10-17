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
 * Landscape (SketchUp: takeoff.landscape, faces the takeoff recognised or the
 * architect marked as hardscape / softscape) has no AHSP item in the book:
 * one line per material under 'site', for the architect to price.
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

  const ELEMENTS = ['demolition', 'structure', 'wall', 'floor', 'ceiling', 'roof', 'opening', 'mep', 'site'];

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

  /* ---------------------------------------------------------------- MEP */
  //
  // takeoff.mep (Revit, MepTakeoff.cs) is a list of
  //   { group, name, system, material, size_mm, unit, quantity }
  // where group is pipe, duct, cable_tray, plumbing_fixture, light, switch,
  // socket, panel, equipment, air_terminal, sprinkler or fire_alarm. mepKey()
  // decides which priced item each row is, from its names. A row it cannot
  // match still becomes a line, with no price, for the architect to fill in.

  const MEP_SECTIONS = {
    pipe: 'Plumbing', plumbing_fixture: 'Plumbing',
    light: 'Electrical', switch: 'Electrical', socket: 'Electrical', panel: 'Electrical', cable_tray: 'Electrical',
    duct: 'Air', air_terminal: 'Air', equipment: 'Air',
    sprinkler: 'Fire', fire_alarm: 'Fire',
  };

  // Pipe kind from its material and system. Revit's default templates model
  // domestic water in copper; Indonesian practice is PVC AW, so a material
  // Dirory does not price falls back by system (and the line says so).
  function pipeKind(row) {
    const m = String(row.material || '') + ' ' + String(row.name || '');
    const sys = String(row.system || '').toLowerCase();
    if (/\bppr?\b|polypropylene/i.test(m)) return { kind: 'ppr' };
    if (/hdpe|\bpe\s?100\b|polyethylene/i.test(m)) return { kind: 'hdpe' };
    if (/galv|\bgi\b|\bsch|steel|baja|black iron/i.test(m)) return { kind: 'gi' };
    const drain = /sanitary|vent|storm|waste|drain|soil|air kotor|air hujan/.test(sys);
    if (/pvc/i.test(m)) return { kind: drain ? 'pvc_d' : 'pvc_aw' };
    if (/fire|sprinkler|hydrant/.test(sys)) return { kind: 'gi', assumed: true };
    return { kind: drain ? 'pvc_d' : 'pvc_aw', assumed: Boolean(m.trim()) };
  }

  // The smallest priced diameter at or above the pipe's, else the largest.
  function pipeKey(row, items) {
    const pk = pipeKind(row);
    const prefix = 'pipe_' + pk.kind + '_';
    const sizes = [];
    items.forEach((_it, key) => {
      if (key.indexOf(prefix) === 0) sizes.push(Number(key.slice(prefix.length)));
    });
    if (!sizes.length) return null;
    sizes.sort((a, b) => a - b);
    const size = Number(row.size_mm) || 0;
    const dn = sizes.find((s) => s >= size - 1) || sizes[sizes.length - 1];
    return { key: prefix + dn, assumed: pk.assumed };
  }

  function acKey(text) {
    let pk = null;
    const m = text.match(/(\d+(?:[.,]\d+)?|1\/2|½)\s*pk/i);
    if (m) pk = m[1] === '1/2' || m[1] === '½' ? 0.5 : parseFloat(m[1].replace(',', '.'));
    const btu = text.match(/(\d{1,2})[.,]?(\d{3})\s*btu/i);
    if (pk == null && btu) pk = Number(btu[1] + btu[2]) / 9000;
    const kw = text.match(/(\d+(?:[.,]\d+)?)\s*kw/i);
    if (pk == null && kw) pk = parseFloat(kw[1].replace(',', '.')) / 2.6;
    if (pk == null) pk = 1;
    if (pk <= 0.75) return 'ac_split_05';
    if (pk <= 1.25) return 'ac_split_10';
    if (pk <= 1.75) return 'ac_split_15';
    return 'ac_split_20';
  }

  // [item keys] for one takeoff row; [] when nothing matches; null for a row
  // that is part of another's price (an AC outdoor unit comes with the indoor
  // unit's installed price). Lights and sockets add their installation point
  // (cable and conduit) as a second item.
  function mepKey(row, items) {
    const t = (String(row.name || '') + ' ' + String(row.material || '')).toLowerCase();
    switch (row.group) {
      case 'pipe': {
        const p = pipeKey(row, items);
        return p ? [p.key] : [];
      }
      case 'plumbing_fixture':
        if (/squat|jongkok/.test(t)) return ['closet_squat'];
        if (/(water ?closet|toilet|closet|kloset|\bwc\b|monoblock|one[\s-]?piece|close[\s-]?coupled)/.test(t)) return [/accessib|disab|difabel/.test(t) ? 'closet_disabled' : 'closet_seat'];
        if (/urinal|urinoir/.test(t)) return ['urinal'];
        if (/shower/.test(t)) return ['shower_set'];
        if (/drain/.test(t)) return ['floor_drain'];
        if (/kitchen|dapur/.test(t)) return [];
        if (/lavator|basin|wastafel|vanity|sink/.test(t)) return ['washbasin'];
        if (/faucet|tap\b|kran|keran/.test(t)) return ['tap'];
        return [];
      case 'light': {
        let fitting = 'downlight';
        if (/exit|emergency|darurat/.test(t)) fitting = 'exit_light';
        else if (/garden|bollard|landscape|outdoor|taman/.test(t)) fitting = 'garden_light';
        else if (/spot|flood|sorot|track/.test(t)) fitting = 'spotlight';
        else if (/linear|batten|tled|fluoresc|strip|troffer|\btl\b|balk/.test(t)) fitting = /2\s?x|2 lamp|twin/.test(t) ? 'batten_2x' : 'batten';
        return [fitting, 'light_point'];
      }
      case 'switch':
        return [/double|2[\s-]?gang|ganda/.test(t) ? 'switch_double' : 'switch_single'];
      case 'socket':
        if (/data|tel|rj ?45|tv|lan/.test(t)) return [];
        return [/\bac\b|air ?con/.test(t) ? 'socket_ac' : 'socket', 'socket_point'];
      case 'panel':
        if (/\bmdp\b|main distribution/.test(t)) return ['panel_mdp'];
        if (/\bsdp\b|sub[\s-]?distribution/.test(t)) return ['panel_sdp'];
        if (/mcb|consumer unit|\bbox\b/.test(t)) return ['mcb_box'];
        if (/panel|\blp\b|\bpp\b/.test(t)) return ['panel_floor'];
        return [];
      case 'equipment':
        if (/outdoor|condens|\bodu\b|\bcdu\b/.test(t)) return null;
        if (/split|\bac\b|air ?con|indoor|fan ?coil|\bfcu\b|wall[\s-]?mount/.test(t)) return [acKey(t)];
        if (/exhaust|ventilat|propeller/.test(t)) return ['exhaust_fan'];
        return [];
      case 'air_terminal':
        if (/diffuser/.test(t)) return ['diffuser'];
        if (/grille|register|louver|louvre/.test(t)) return ['grille'];
        return [];
      case 'sprinkler':
        return [/upright/.test(t) ? 'sprinkler_upright' : 'sprinkler_pendant'];
      case 'fire_alarm':
        if (/smoke|heat|detector/.test(t)) return ['smoke_detector', 'detector_point'];
        return [];
      default:
        return [];
    }
  }

  function mepLabel(row) {
    const parts = [row.name];
    if (row.group === 'pipe') {
      if (row.system) parts.push(row.system);
      if (row.size_mm) parts.push('Ø' + row.size_mm + ' mm');
    }
    return parts.filter(Boolean).join(' · ');
  }

  // One line per priced item and Revit type (so a WC from one brand can be
  // priced apart from another); pipes per item and system; installation
  // points in one line each. Unmatched rows are lines without a price.
  function mepLines(takeoff, items) {
    const rows = (takeoff && takeoff.mep) || [];
    const byId = new Map();
    const add = (id, fields, quantity) => {
      if (!byId.has(id)) byId.set(id, Object.assign({ id: id, element: 'mep', quantity: 0 }, fields));
      byId.get(id).quantity += quantity;
    };
    rows.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return;
      const section = MEP_SECTIONS[row.group] || 'MEP';
      const matched = mepKey(row, items);
      if (matched === null) return;
      const keys = matched.filter((k) => items.has(k));
      if (!keys.length) {
        add('mep|' + row.group + '|' + row.name, {
          key: null, section: section, name: mepLabel(row), unit: row.unit || 'unit', needs_price: true, reference: '',
        }, qty);
        return;
      }
      keys.forEach((key) => {
        const it = items.get(key);
        const shared = /_point$/.test(key);
        if (row.group === 'pipe') {
          const assumed = pipeKind(row).assumed;
          add('mep|' + key + '|' + (row.system || ''), {
            key: key, section: section, reference: it.reference || '', unit: it.unit,
            name: it.name + (row.system ? ' · ' + row.system : '') + (assumed ? ' (modelled in ' + row.material + ')' : ''),
          }, qty);
        } else if (shared) {
          add('mep|' + key, { key: key, section: section, reference: it.reference || '', unit: it.unit, name: it.name }, qty);
        } else {
          add('mep|' + key + '|' + row.name, {
            key: key, section: section, reference: it.reference || '', unit: it.unit, name: it.name + ' · ' + row.name,
          }, qty);
        }
      });
    });
    const order = ['Plumbing', 'Electrical', 'Air', 'Fire', 'MEP'];
    return Array.from(byId.values()).map((l) => {
      const it = l.key ? items.get(l.key) : null;
      return Object.assign(l, {
        quantity: round2(l.quantity),
        price: it ? Number(it.unit_price) || 0 : 0,
        basis: 'mep',
      });
    }).sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  }

  /* --------------------------------------------------------- demolition */
  //
  // takeoff.demolition: what the priced phase demolishes (Revit phasing, see
  // Phasing.cs) or what a SketchUp model tags "Demolish" / "Bongkar":
  //   { group, name, unit, quantity, width_m }
  // Groups: masonry and concrete (m3), wall_area (m2 of SketchUp wall faces),
  // floor / floor_tiled, ceiling, roof (m2), door, window (units, with width),
  // and the MEP groups or `component` (SketchUp) for fixtures and fittings.

  // Wall thickness for demolishing SketchUp walls, which have faces, not
  // thickness: a plastered half-brick wall.
  const DEMO_WALL_THICKNESS_M = 0.15;

  function fixtureDemoKey(t) {
    if (/squat|jongkok/.test(t)) return 'demo_wc_squat';
    if (/(water ?closet|toilet|closet|kloset|\bwc\b|monoblock)/.test(t)) return 'demo_wc';
    if (/urinal|urinoir/.test(t)) return 'demo_urinal';
    if (/drain/.test(t)) return 'demo_floor_drain';
    if (/lavator|basin|wastafel|vanity/.test(t)) return 'demo_washbasin';
    return null;
  }

  // [item key, quantity factor] for a demolished row; [] when Dirory has no
  // item (listed for a price); null when it is not priced at all (furniture
  // in SketchUp, an AC's outdoor unit).
  function demoKey(row, o) {
    const t = String(row.name || '').toLowerCase();
    const double = (Number(row.width_m) || 0) > 1.2;
    switch (row.group) {
      case 'masonry': return [['demo_brick', 1]];
      case 'wall_area': return [['demo_brick', (o.wallsBothSides ? 0.5 : 1) * DEMO_WALL_THICKNESS_M]];
      case 'concrete': return [['demo_concrete', 1]];
      case 'floor_tiled': return [['demo_floor_tile', 1]];
      case 'floor': return TILE_RE.test(t) ? [['demo_floor_tile', 1]] : [];
      case 'ceiling': return [['demo_ceiling', 1]];
      case 'roof': return [['demo_roof_tile', 1], ['demo_roof_frame', 1]];
      case 'door': return [[double ? 'demo_door_double' : 'demo_door', 1]];
      case 'window': return [[double ? 'demo_window_double' : 'demo_window', 1]];
      case 'light': return [['demo_light', 1]];
      case 'plumbing_fixture': {
        const k = fixtureDemoKey(t);
        return k ? [[k, 1]] : [];
      }
      case 'equipment':
        if (/outdoor|condens|\bodu\b|\bcdu\b/.test(t)) return null;
        return /split|\bac\b|air ?con|indoor|wall[\s-]?mount/.test(t) ? [['demo_ac', 1]] : [];
      case 'component': {
        if (/lamp|light|downlight|lampu/.test(t)) return [['demo_light', 1]];
        if (/split|\bac\b|air ?con/.test(t)) return [['demo_ac', 1]];
        const k = fixtureDemoKey(t);
        return k ? [[k, 1]] : null;
      }
      default:
        return [];
    }
  }

  function demolitionLines(takeoff, items, o) {
    const rows = (takeoff && takeoff.demolition) || [];
    const byId = new Map();
    const add = (id, fields, quantity) => {
      if (!byId.has(id)) byId.set(id, Object.assign({ id: id, element: 'demolition', basis: 'demolition', quantity: 0 }, fields));
      byId.get(id).quantity += quantity;
    };
    const perType = /^(door|window|plumbing_fixture|equipment|component)$/;
    rows.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return;
      const matched = demoKey(row, o);
      if (matched === null) return;
      const keys = matched.filter(([k]) => items.has(k));
      if (!keys.length) {
        add('demo|' + row.group + '|' + row.name, {
          key: null, name: 'Demolish: ' + row.name, unit: row.unit || 'unit', needs_price: true, reference: '', price: 0,
        }, qty);
        return;
      }
      keys.forEach(([key, factor]) => {
        const it = items.get(key);
        const named = perType.test(row.group);
        add('demo|' + key + (named ? '|' + row.name : ''), {
          key: key, unit: it.unit, reference: it.reference || '', price: Number(it.unit_price) || 0,
          name: it.name + (named ? ' · ' + row.name : '') +
            (row.group === 'wall_area' ? ' (' + Math.round(DEMO_WALL_THICKNESS_M * 100) + ' cm thick walls assumed)' : ''),
        }, qty * factor);
      });
    });
    return Array.from(byId.values()).map((l) => Object.assign(l, { quantity: round2(l.quantity) }));
  }

  function landscapeLines(takeoff) {
    return ((takeoff && takeoff.landscape) || []).filter((r) => Number(r.area_m2) > 0).map((r) => {
      const hard = r.role === 'landscape_hard';
      return {
        id: 'site|' + r.role + '|' + r.material,
        element: 'site',
        key: null,
        basis: 'landscape',
        name: (hard ? 'Hardscape (perkerasan): ' : 'Softscape (taman): ') + r.material,
        quantity: round2(r.area_m2),
        unit: 'm2',
        needs_price: true,
        reference: '',
        price: 0,
      };
    });
  }

  /**
   * computeRab(takeoff, book, options) ->
   *   { region, lines: [{id, element, key, name, basis, quantity, unit, unit_price, amount,
   *                      custom, needs_price, section}],
   *     subtotals: {wall: n, ...}, total, unpriced, missing: [item keys not in the book] }
   *
   * options.prices: { [line id]: unit price } - the architect's own prices,
   * which replace the book's for that line (or price a line the book cannot).
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
      lines.push({
        id: spec.item + '|' + spec.basis,
        element: spec.element || it.element,
        key: spec.item,
        name: spec.label || (spec.prefix ? spec.prefix + ': ' + it.name : it.name),
        basis: spec.basis,
        quantity: quantity,
        unit: it.unit,
        price: Number(it.unit_price) || 0,
        reference: it.reference || '',
      });
    });
    demolitionLines(takeoff, items, o).forEach((l) => lines.push(l));
    mepLines(takeoff, items).forEach((l) => lines.push(l));
    landscapeLines(takeoff).forEach((l) => lines.push(l));

    const prices = o.prices || {};
    lines.forEach((l) => {
      const own = prices[l.id];
      if (typeof own === 'number' && isFinite(own) && own >= 0) {
        l.price = own;
        l.custom = true;
        l.needs_price = false;
      }
      // Amounts use the exact unit price; the line shows it rounded.
      l.unit_price = Math.round(l.price);
      l.amount = Math.round(l.quantity * l.price);
      delete l.price;
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
      unpriced: lines.filter((l) => l.needs_price).length,
      missing: missing,
    };
  }

  /**
   * A price book for another kabupaten/kota: the DKI Jakarta book's unit and
   * basic prices x IKK(city) / IKK(DKI Jakarta), from BPS's Indeks Kemahalan
   * Konstruksi 2025 (ikk.js). The AHSP coefficients do not change, only the
   * prices. `city` is { code, name, province, ikk }; null keeps Jakarta.
   */
  function bookForCity(book, city, ikk) {
    if (!book || !city || !ikk || !ikk.reference) return book;
    const factor = Number(city.ikk) / Number(ikk.reference.ikk);
    if (!isFinite(factor) || factor <= 0) return book;
    const pct = (n) => String(n).replace('.', ',');
    return Object.assign({}, book, {
      name: city.name,
      base_name: book.name,
      city_code: city.code,
      factor: factor,
      source: `${city.name}: harga ${book.name} × IKK ${pct(city.ikk)} / ${pct(ikk.reference.ikk)} ` +
        `(BPS, Indeks Kemahalan Konstruksi 2025). ${book.source || ''}`.trim(),
      items: (book.items || []).map((it) => Object.assign({}, it, {
        unit_price: (Number(it.unit_price) || 0) * factor,
        components: (it.components || []).map((c) => Object.assign({}, c, { price: (Number(c.price) || 0) * factor })),
      })),
    });
  }

  const api = {
    computeRab: computeRab,
    bookForCity: bookForCity,
    quantities: quantities,
    mepKey: mepKey,
    ELEMENTS: ELEMENTS,
    MEMBERS: MEMBERS,
    MEMBER_LABELS: MEMBER_LABELS,
    REBAR_RATIO: REBAR_RATIO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryRab = api;
})(typeof window !== 'undefined' ? window : this);
