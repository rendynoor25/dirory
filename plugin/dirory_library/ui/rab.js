/* Dirory — RAB (Rencana Anggaran Biaya) calculator.
 *
 * Pure: takes the quantity takeoff (takeoff.rb, or Takeoff.cs in Revit) and a regional price book
 * (the `rab` Edge Function), returns priced lines. No DOM, no SketchUp, so it
 * runs in the panel and under Node for tests (scripts/test-rab.mjs).
 *
 * How the takeoff becomes volumes:
 *   wall_core          masonry area = wall surfaces / 2 (a wall is drawn with
 *                      both faces), or the surfaces as-is for single-face walls;
 *                      split into wall_core_aac and wall_core_brick by the
 *                      wall's name and materials (hebel, bata ringan, AAC ... or
 *                      bata, brick), and options.wallType for walls that say
 *                      neither
 *   wall_finish        plaster, skim coat, paint: every wall surface that is
 *                      not tiled
 *   wall_tiled         wall surfaces finished with a tile material
 *   floor              floor area, all of it; priced per finish from the
 *                      floor's name and materials (floorKind): floor_tile,
 *                      floor_granite, floor_homogeneous, floor_parquet,
 *                      floor_carpet; a bare concrete deck (dak beton) has no
 *                      finish line, and any other finish (vinyl, marble ...)
 *                      becomes a line for the architect to price
 *   floor_perimeter    skirting length (m')
 *   ceiling            ceiling area
 *   roof               roof area (true, slope included), per covering
 *                      (roofKind): roof_tile, roof_metal, roof_concrete (a
 *                      concrete deck: waterproofing, no truss); roof_framed is
 *                      the area that needs a light-steel truss
 *   opening_perimeter  frame length: 2 x (W + H) per door/window
 *   door_area          W x H per door
 *   window_area        W x H per window
 *
 * Landscape (SketchUp: takeoff.landscape, faces the takeoff recognised or the
 * architect marked as hardscape / softscape) has no AHSP item in the book:
 * one line per material under 'site', for the architect to price.
 *
 * Stairs, railings and casework (Revit: takeoff.extras) go under 'misc':
 * railings per metre (stair railing or guard railing), steel or timber stairs
 * and casework (kitchen sets, per metre) for the architect to price. Concrete
 * stairs are structure (member 'stair').
 *
 * Structure (Revit only; takeoff.structure, see StructureTakeoff.cs), per
 * member - footing, tie_beam (sloof), column, beam, slab, wall, stair:
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
  const AAC_RE = /\b(aac|alc|hebel|bata ringan|celcon|citicon|lightweight|light ?weight)\b/i;
  const BRICK_RE = /\b(brick|bata|batako)\b/i;
  const BARE_RE = /\b(beton|concrete|dak|slab|plat|screed|cor|rabat)\b/i;

  // One RAB line per (item, basis). `fallback`: the item to use when the
  // price book does not have this one yet; `toPrice` and `unit`: the line to
  // list for the architect to price when neither is in the book.
  const LINES = [
    { item: 'wall_brick', basis: 'wall_core_brick' },
    { item: 'wall_aac', basis: 'wall_core_aac' },
    { item: 'plaster', basis: 'wall_finish' },
    { item: 'skim_coat', basis: 'wall_finish' },
    { item: 'paint_wall', basis: 'wall_finish' },
    { item: 'wall_tile', basis: 'wall_tiled' },
    { item: 'floor_tile', basis: 'floor_tile' },
    { item: 'floor_granite', basis: 'floor_granite', fallback: 'floor_tile' },
    { item: 'floor_homogeneous', basis: 'floor_homogeneous', fallback: 'floor_tile' },
    { item: 'floor_parquet', basis: 'floor_parquet', toPrice: 'Timber / parquet floor', unit: 'm2' },
    { item: 'floor_carpet', basis: 'floor_carpet', toPrice: 'Carpet floor', unit: 'm2' },
    { item: 'skirting', basis: 'floor_perimeter' },
    { item: 'ceiling_frame', basis: 'ceiling' },
    { item: 'ceiling_gypsum', basis: 'ceiling' },
    { item: 'paint_wall', basis: 'ceiling', label: 'Ceiling paint (primer + 2 coats)', element: 'ceiling' },
    { item: 'roof_truss', basis: 'roof_framed' },
    { item: 'roof_tile', basis: 'roof_tile' },
    { item: 'roof_metal', basis: 'roof_metal', toPrice: 'Metal sheet roofing', unit: 'm2' },
    { item: 'roof_waterproof', basis: 'roof_concrete', toPrice: 'Waterproofing, concrete roof deck', unit: 'm2' },
    { item: 'frame_alu', basis: 'opening_perimeter' },
    { item: 'door_leaf', basis: 'door_area' },
    { item: 'glass', basis: 'window_area' },
  ];

  // Line ids before walls, floors and roofs were priced per material: a price
  // the architect saved under the old id still applies.
  const OLD_LINE_IDS = {
    'wall_brick|wall_core_brick': 'wall_brick|wall_core',
    'wall_aac|wall_core_aac': 'wall_aac|wall_core',
    'floor_tile|floor_tile': 'floor_tile|floor',
    'roof_truss|roof_framed': 'roof_truss|roof',
    'roof_tile|roof_tile': 'roof_tile|roof',
  };

  // Structure lines are per member, in the order an RAB lists them.
  const MEMBERS = ['footing', 'tie_beam', 'column', 'beam', 'slab', 'wall', 'stair'];
  const MEMBER_LABELS = {
    footing: 'Footings (pondasi)',
    tie_beam: 'Sloof',
    column: 'Columns (kolom)',
    beam: 'Beams (balok)',
    slab: 'Slabs (plat lantai)',
    wall: 'Concrete walls (dinding beton)',
    stair: 'Concrete stairs (tangga beton)',
  };
  // Rebar where none is modelled, kg per m3 of concrete. Planning ratios for
  // ordinary low- to mid-rise buildings in Indonesia, not from AHSP: model the
  // rebar in Revit, or pass options.rebarRatio, for a real figure.
  const REBAR_RATIO = { footing: 90, tie_beam: 130, column: 180, beam: 160, slab: 110, wall: 120, stair: 120 };

  const ELEMENTS = ['demolition', 'structure', 'wall', 'floor', 'ceiling', 'roof', 'opening', 'misc', 'mep', 'site'];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function isTiled(row) {
    return TILE_RE.test(String(row.category || '')) || TILE_RE.test(String(row.material || ''));
  }

  // Everything a row says about what it is made of: its material (SketchUp)
  // or type name (Revit), category, and the type's layer materials (Revit).
  function rowText(row) {
    return [row.material, row.category, row.spec].filter(Boolean).join(' ');
  }

  // 'aac' or 'brick' when a wall row's name or materials say which; null
  // when they do not (or for a concrete wall).
  function wallCoreNamed(row) {
    if (row.core === 'concrete') return null;
    const t = rowText(row);
    if (AAC_RE.test(t)) return 'aac';
    if (BRICK_RE.test(t)) return 'brick';
    return null;
  }

  // 'aac' or 'brick' for a masonry wall row; null for a concrete wall.
  function wallCore(row, o) {
    if (row.core === 'concrete') return null;
    return wallCoreNamed(row) || (o.wallType === 'aac' ? 'aac' : 'brick');
  }

  // The finish a floor row is priced as. 'other' rows are listed to price.
  function floorKind(row) {
    const t = rowText(row);
    if (/\b(carpet|karpet|permadani|rug)\b|\u0E1E\u0E23\u0E21/i.test(t)) return 'carpet';
    if (/\b(vinyl|spc|lvt|laminat\w*|wpc|epoxy|terrazzo|teraso|marmer|marble|batu alam|stone)\b/i.test(t)) return 'other';
    if (/\b(parquet|parket|timber|wood|wooden|kayu)\b/i.test(t)) return 'parquet';
    if (/\bgranit/i.test(t)) return 'granite';
    if (/\bhomogen/i.test(t)) return 'homogeneous';
    if (TILE_RE.test(t)) return 'tile';
    if (BARE_RE.test(t)) return 'bare';
    return 'tile';
  }

  // The covering a roof row is priced as.
  function roofKind(row) {
    const t = rowText(row);
    if (/\b(polycarbonate?|polikarbonat|upvc|pvc|onduline|bitumen|aspal|shingle|sirap|kaca|glass|alang)\b/i.test(t)) return 'other';
    if (/\b(metal|zinc\w*|spandek|spandex|galvalum\w*|seng|alumin\w*|steel|baja)\b/i.test(t)) return 'metal';
    if (/\b(genteng|tile|tiles|roof ?tile)\b/i.test(t)) return 'tile';
    if (BARE_RE.test(t) || /\bdeck\b/i.test(t)) return 'concrete';
    return 'tile';
  }

  // Quantities per basis, from a takeoff.
  function quantities(takeoff, options) {
    const o = Object.assign({ wallsBothSides: true }, options || {});
    const rows = (takeoff && takeoff.rows) || [];
    const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (Number(r.area_m2) || 0), 0);
    const wall = sum((r) => r.element === 'wall');
    const masonry = sum((r) => r.element === 'wall' && r.core !== 'concrete');
    const tiled = sum((r) => r.element === 'wall' && isTiled(r));
    const core = (kind) => {
      const m2 = sum((r) => r.element === 'wall' && wallCore(r, o) === kind);
      return round2(o.wallsBothSides ? m2 / 2 : m2);
    };
    const floorOf = (kind) => round2(sum((r) => r.element === 'floor' && floorKind(r) === kind));
    const roofOf = (kind) => round2(sum((r) => r.element === 'roof' && roofKind(r) === kind));
    const openings = (takeoff && takeoff.openings) || [];
    const perimeter = openings.reduce((s, x) => s + 2 * ((x.width_m || 0) + (x.height_m || 0)) * (x.count || 0), 0);
    const area = (kind) =>
      openings.filter((x) => x.kind === kind).reduce((s, x) => s + (x.width_m || 0) * (x.height_m || 0) * (x.count || 0), 0);
    return Object.assign({
      wall_core: round2(o.wallsBothSides ? masonry / 2 : masonry),
      wall_core_brick: core('brick'),
      wall_core_aac: core('aac'),
      wall_finish: round2(wall - tiled),
      wall_tiled: round2(tiled),
      floor: round2(sum((r) => r.element === 'floor')),
      floor_tile: floorOf('tile'),
      floor_granite: floorOf('granite'),
      floor_homogeneous: floorOf('homogeneous'),
      floor_parquet: floorOf('parquet'),
      floor_carpet: floorOf('carpet'),
      floor_bare: floorOf('bare'),
      floor_perimeter: round2((takeoff && takeoff.floor_perimeter_m) || 0),
      ceiling: round2(sum((r) => r.element === 'ceiling')),
      roof: round2(sum((r) => r.element === 'roof')),
      roof_tile: roofOf('tile'),
      roof_metal: roofOf('metal'),
      roof_concrete: roofOf('concrete'),
      roof_framed: round2(sum((r) => r.element === 'roof' && roofKind(r) !== 'concrete')),
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

  const APPLIANCE_RE = /refrigerator|fridge|kulkas|freezer|microwave|\boven\b|dispenser|kettle|coffee|\btv\b|television|televisi|washing|mesin cuci|dryer|dishwasher|cooker|\bhob\b|kompor|blender/;

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
    // A 2D symbol or annotation family stands for an element modelled
    // elsewhere (or nothing to build): never priced.
    if (/\b(symbol|simbol|annotation|anotasi)\b/.test(t)) return null;
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
        // A mixer or tap, also one whose name says sink: before the basins.
        if (/faucet|\btap\b|kran|keran|mixer/.test(t)) return [/kitchen|dapur|\bsink\b/.test(t) ? 'tap_kitchen' : 'tap'];
        if (/kitchen|dapur/.test(t)) return [];
        if (/lavator|basin|wastafel|vanity|sink/.test(t)) return ['washbasin'];
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
        // Appliances modelled as electrical equipment are the owner's, not
        // part of the building (their socket is priced where one is modelled).
        if (APPLIANCE_RE.test(t)) return null;
        if (/\bmdp\b|main distribution/.test(t)) return ['panel_mdp'];
        if (/\bsdp\b|sub[\s-]?distribution/.test(t)) return ['panel_sdp'];
        if (/mcb|consumer unit|\bbox\b/.test(t)) return ['mcb_box'];
        if (/panel|\blp\b|\bpp\b/.test(t)) return ['panel_floor'];
        return [];
      case 'equipment':
        if (/outdoor|condens|\bodu\b|\bcdu\b/.test(t)) return null;
        if (APPLIANCE_RE.test(t)) return null;
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
      // By hand unless the architect chooses a jack hammer: small volumes in
      // an occupied house are usually broken by hand.
      case 'concrete': return [[o.demoConcrete === 'jackhammer' ? 'demo_concrete' : 'demo_concrete_manual', 1]];
      case 'floor_tiled': return [['demo_floor_tile', 1]];
      case 'floor':
        if (TILE_RE.test(t)) return [['demo_floor_tile', 1]];
        // A bare concrete deck: its concrete is demolished as `concrete`.
        return BARE_RE.test(t) ? null : [];
      case 'ceiling': return [['demo_ceiling', 1]];
      case 'roof': {
        const kind = roofKind({ material: row.name });
        if (kind === 'concrete') return null;
        return [[kind === 'metal' ? 'demo_roof_metal' : 'demo_roof_tile', 1], ['demo_roof_frame', 1]];
      }
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
    const perType = /^(door|window|plumbing_fixture|equipment|component|stair|railing|casework)$/;
    // Items newer than some price books: use the older one meanwhile.
    const FALLBACK = { demo_concrete_manual: 'demo_concrete', demo_roof_metal: 'demo_roof_tile' };
    rows.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return;
      const matched = demoKey(row, o);
      if (matched === null) return;
      const keys = matched
        .map(([k, f]) => [items.has(k) ? k : FALLBACK[k] || k, f])
        .filter(([k]) => items.has(k));
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

  // The element a basis belongs to, for a line the book has no item for.
  function elementOf(basis) {
    return String(basis).split('_')[0];
  }

  // Floor and roof finishes Dirory has no item for (vinyl, marble,
  // polycarbonate ...): one line per material, for the architect to price.
  function otherFinishLines(takeoff) {
    const rows = (takeoff && takeoff.rows) || [];
    const byId = new Map();
    rows.forEach((r) => {
      const floor = r.element === 'floor' && floorKind(r) === 'other';
      const roof = r.element === 'roof' && roofKind(r) === 'other';
      if (!floor && !roof || !(Number(r.area_m2) > 0)) return;
      const id = r.element + '|other|' + r.material;
      if (!byId.has(id)) {
        byId.set(id, {
          id: id, element: r.element, key: null, basis: r.element + '_other',
          name: (floor ? 'Floor finish: ' : 'Roof covering: ') + r.material,
          quantity: 0, unit: 'm2', needs_price: true, reference: '', price: 0,
        });
      }
      byId.get(id).quantity += Number(r.area_m2);
    });
    return Array.from(byId.values()).map((l) => Object.assign(l, { quantity: round2(l.quantity) }));
  }

  // takeoff.extras (Revit): [{ group: railing | stair | casework, name, unit,
  // quantity, on_stair }]. Railings are priced per metre; stairs that are not
  // concrete and casework are listed for the architect to price.
  function extraLines(takeoff, items) {
    const rows = (takeoff && takeoff.extras) || [];
    const byId = new Map();
    rows.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return;
      let key = null;
      if (row.group === 'railing') key = row.on_stair ? 'railing_stair' : 'railing';
      const it = key && items.get(key);
      const prefix = { railing: 'Railing', stair: 'Stair', casework: 'Casework / kitchen set' }[row.group] || row.group;
      const id = 'misc|' + (it ? key : row.group) + '|' + row.name;
      if (!byId.has(id)) {
        byId.set(id, it ? {
          id: id, element: 'misc', key: key, basis: row.group, name: it.name + ' · ' + row.name,
          quantity: 0, unit: it.unit, reference: it.reference || '', price: Number(it.unit_price) || 0,
        } : {
          id: id, element: 'misc', key: null, basis: row.group, name: prefix + ': ' + row.name,
          quantity: 0, unit: row.unit || 'unit', needs_price: true, reference: '', price: 0,
        });
      }
      byId.get(id).quantity += qty;
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
   * options.demoConcrete: 'manual' (default) or 'jackhammer', for demolished concrete.
   * options.prices: { [line id]: unit price } - the architect's own prices,
   * which replace the book's for that line (or price a line the book cannot).
   */
  function computeRab(takeoff, book, options) {
    const o = Object.assign({ wallType: 'brick', wallsBothSides: true, concrete: 'readymix', demoConcrete: 'manual' }, options || {});
    const q = quantities(takeoff, o);
    const items = new Map(((book && book.items) || []).map((it) => [it.key, it]));
    const lines = [];
    const missing = [];
    structureLines(o).concat(LINES).forEach((spec) => {
      if (spec.when && !spec.when(o)) return;
      const quantity = q[spec.basis] || 0;
      if (quantity <= 0) return;
      const it = items.get(spec.item) || (spec.fallback && items.get(spec.fallback));
      if (!it) {
        if (missing.indexOf(spec.item) < 0) missing.push(spec.item);
        if (spec.toPrice) {
          lines.push({
            id: spec.item + '|' + spec.basis, element: spec.element || elementOf(spec.basis), key: null,
            name: spec.toPrice, basis: spec.basis, quantity: quantity, unit: spec.unit || 'm2',
            needs_price: true, reference: '', price: 0,
          });
        }
        return;
      }
      lines.push({
        id: spec.item + '|' + spec.basis,
        element: spec.element || it.element,
        key: it.key,
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
    otherFinishLines(takeoff).forEach((l) => lines.push(l));
    extraLines(takeoff, items).forEach((l) => lines.push(l));
    landscapeLines(takeoff).forEach((l) => lines.push(l));

    const prices = o.prices || {};
    lines.forEach((l) => {
      const own = l.id in prices ? prices[l.id] : prices[OLD_LINE_IDS[l.id]];
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
    floorKind: floorKind,
    roofKind: roofKind,
    wallCoreNamed: wallCoreNamed,
    ELEMENTS: ELEMENTS,
    MEMBERS: MEMBERS,
    MEMBER_LABELS: MEMBER_LABELS,
    REBAR_RATIO: REBAR_RATIO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryRab = api;
})(typeof window !== 'undefined' ? window : this);
