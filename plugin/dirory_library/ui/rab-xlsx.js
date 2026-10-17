/* Dirory — the RAB as an Excel workbook, organised the way Indonesian
 * estimators build one:
 *
 *   REKAP              summary per division, PPN, total, cost per m2
 *   RAB                work items: volume x unit price = amount, per division
 *   AHS BONGKAR / STR / ARS / MEP
 *                      Analisa Harga Satuan: one block per work item, labour,
 *                      materials and equipment (coefficient x basic price),
 *                      plus overhead and profit
 *   HARGA UPAH BAHAN   the basic prices (HSD) every analysis points to; change
 *                      a price or the overhead % here and the whole workbook
 *                      follows
 *   VOL                the volumes, as measured from the model
 *   CATATAN            sources and assumptions
 *
 * Every link is a formula: RAB volumes point to VOL, RAB unit prices to the
 * AHS totals, AHS prices to HARGA UPAH BAHAN. Values are cached too, so the
 * file reads right before Excel recalculates.
 *
 * Pure: buildRabWorkbook({ rab, book, takeoff, project, date }) returns the
 * sheet model for DiroryXlsx.write. rab is computeRab()'s result; book the
 * full price book (with components, Dirory Pro).
 */
(function (root) {
  'use strict';

  const DIVISIONS = {
    demolition: 'PEKERJAAN PEMBONGKARAN',
    structure: 'PEKERJAAN STRUKTUR',
    wall: 'PEKERJAAN DINDING',
    floor: 'PEKERJAAN LANTAI',
    ceiling: 'PEKERJAAN PLAFON',
    roof: 'PEKERJAAN ATAP',
    opening: 'PEKERJAAN KUSEN, PINTU DAN JENDELA',
    mep: 'PEKERJAAN MEKANIKAL, ELEKTRIKAL DAN PLUMBING',
    site: 'PEKERJAAN LANSEKAP',
    misc: 'PEKERJAAN TANGGA, RAILING DAN INTERIOR',
  };
  const ORDER = ['demolition', 'structure', 'wall', 'floor', 'ceiling', 'roof', 'opening', 'misc', 'mep', 'site'];
  const AHS_SHEET = {
    demolition: 'AHS BONGKAR', structure: 'AHS STR', mep: 'AHS MEP',
    wall: 'AHS ARS', floor: 'AHS ARS', ceiling: 'AHS ARS', roof: 'AHS ARS', opening: 'AHS ARS', site: 'AHS ARS', misc: 'AHS ARS',
  };
  const MEP_SECTIONS = { Plumbing: 'Plumbing', Electrical: 'Elektrikal', Air: 'Tata udara', Fire: 'Proteksi kebakaran', MEP: 'Lain-lain' };
  const KIND_LABEL = { labour: 'TENAGA KERJA', material: 'BAHAN', equipment: 'PERALATAN' };
  const PRICES = 'HARGA UPAH BAHAN';
  // PPN: 12% on a DPP of 11/12 of the price (PMK 131/2024) = 11% effective.
  const PPN_DEFAULT = 0.11;

  const q = (sheet) => `'${sheet}'`;
  const isMarket = (item) => /^Market estimate/.test(String((item && item.reference) || ''));
  const round2 = (n) => Math.round(n * 100) / 100;

  // A sheet under construction: rows of cells, with the next row's number.
  function sheet(name, cols) {
    const s = { name: name, cols: cols, rows: [], merges: [] };
    s.add = (cells) => { s.rows.push(cells); return s.rows.length; };
    s.gap = () => s.rows.push([]);
    return s;
  }

  /* ------------------------------------------------- HARGA UPAH BAHAN */

  function pricesSheet(items, book) {
    const s = sheet(PRICES, [6, 52, 14, 10, 18, 30]);
    s.add([{ v: 'DAFTAR HARGA SATUAN DASAR UPAH, BAHAN DAN PERALATAN', s: 'title' }]);
    s.add([{ v: `${book.name || ''} · ${book.fetched ? 'harga per ' + book.fetched : ''}`, s: 'note' }]);
    s.gap();
    const overheadRow = s.add([null, { v: 'Biaya umum dan keuntungan (dipakai semua AHS kecuali harga pasar)', s: 'bold' }, null, null,
      { v: (Number(book.overhead_pct) || 15) / 100, s: 'inputPercent' }, { v: 'Ubah di sini; seluruh AHS mengikuti.', s: 'note' }]);
    s.gap();
    const ref = new Map();
    const byKind = { labour: [], material: [], equipment: [] };
    items.forEach((it) => (it.components || []).forEach((c) => {
      const key = [c.kind, c.name, c.unit, c.price].join('|');
      if (ref.has(key)) return;
      ref.set(key, null);
      (byKind[c.kind] || byKind.material).push(c);
    }));
    ['labour', 'material', 'equipment'].forEach((kind, k) => {
      const list = byKind[kind];
      if (!list.length) return;
      s.add([{ v: 'ABC'[k], s: 'section' }, { v: KIND_LABEL[kind], s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' },
        { v: '', s: 'section' }, { v: '', s: 'section' }]);
      s.add(['No', 'Uraian', 'Kode', 'Satuan', 'Harga Satuan (Rp)', 'Sumber'].map((v) => ({ v: v, s: 'header' })));
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      list.forEach((c, i) => {
        const r = s.add([{ v: i + 1, s: 'number' }, { v: c.name, s: 'wrap' }, { v: c.code || '', s: 'wrap' }, { v: c.unit || '', s: 'wrap' },
          { v: Number(c.price) || 0, s: 'input' }, { v: c.price_source === 'market' ? 'Harga pasar' : (c.price_source || ''), s: 'wrap' }]);
        ref.set([c.kind, c.name, c.unit, c.price].join('|'), `${q(PRICES)}!$E$${r}`);
      });
      s.gap();
    });
    s.freezeRow = 0;
    return { sheet: s, ref: ref, overhead: `${q(PRICES)}!$E$${overheadRow}`, overheadValue: (Number(book.overhead_pct) || 15) / 100 };
  }

  /* ----------------------------------------------------------- AHS */

  // One analysis block per work item. Returns the cell holding its unit price.
  function ahsBlock(s, item, prices) {
    const name = s.name;
    const start = s.add([{ v: 'JENIS PEKERJAAN', s: 'bold' }, { v: item.title || item.name, s: 'bold' }]);
    s.merges.push(`B${start}:G${start}`);
    s.add([{ v: 'Satuan', s: 'note' }, { v: `per ${item.unit}  ·  ${item.name}`, s: 'note' }]);
    s.add([{ v: 'Referensi', s: 'note' }, { v: item.reference || '', s: 'note' }]);
    s.add(['No', 'Uraian', 'Kode', 'Satuan', 'Koefisien', 'Harga Satuan (Rp)', 'Jumlah (Rp)'].map((v) => ({ v: v, s: 'header' })));
    const subtotals = [];
    let sumValue = 0;
    ['labour', 'material', 'equipment'].forEach((kind, k) => {
      const list = (item.components || []).filter((c) => (c.kind || 'material') === kind);
      if (!list.length) return;
      s.add([{ v: 'ABC'[k], s: 'section' }, { v: KIND_LABEL[kind], s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' },
        { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
      let first = 0;
      let last = 0;
      let value = 0;
      list.forEach((c, i) => {
        const price = Number(c.price) || 0;
        const coef = Number(c.coef) || 0;
        const priceRef = prices.ref.get([c.kind, c.name, c.unit, c.price].join('|'));
        const r = s.rows.length + 1;
        s.add([{ v: i + 1, s: 'number' }, { v: c.name, s: 'wrap' }, { v: c.code || '', s: 'wrap' }, { v: c.unit || '', s: 'wrap' },
          { v: coef, s: 'number' }, priceRef ? { f: priceRef, v: price, s: 'money' } : { v: price, s: 'money' },
          { f: `E${r}*F${r}`, v: coef * price, s: 'money' }]);
        if (!first) first = r;
        last = r;
        value += coef * price;
      });
      const r = s.add([null, { v: `Jumlah ${KIND_LABEL[kind].toLowerCase()}`, s: 'bold' }, null, null, null, null,
        { f: `SUM(G${first}:G${last})`, v: value, s: 'moneyBold' }]);
      subtotals.push(`G${r}`);
      sumValue += value;
    });
    const dRow = s.add([{ v: 'D', s: 'bold' }, { v: 'Jumlah (A + B + C)', s: 'bold' }, null, null, null, null,
      { f: subtotals.length ? subtotals.join('+') : '0', v: sumValue, s: 'moneyBold' }]);
    const market = isMarket(item);
    const overheadValue = market ? 0 : prices.overheadValue;
    const eRow = s.add([{ v: 'E', s: 'bold' },
      { v: market ? 'Biaya umum dan keuntungan (harga pasar: sudah termasuk)' : 'Biaya umum dan keuntungan', s: 'bold' }, null, null,
      market ? { v: 0, s: 'percent' } : { f: prices.overhead, v: overheadValue, s: 'percent' }, null,
      { f: `G${dRow}*E${s.rows.length + 1}`, v: sumValue * overheadValue, s: 'moneyBold' }]);
    const fRow = s.add([{ v: 'F', s: 'total' }, { v: `Harga satuan pekerjaan (D + E), per ${item.unit}`, s: 'total' },
      { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' },
      { f: `G${dRow}+G${eRow}`, v: sumValue * (1 + overheadValue), s: 'total' }]);
    s.gap();
    return { ref: `${q(name)}!$G$${fRow}`, value: sumValue * (1 + overheadValue) };
  }

  /* ------------------------------------------------------------ VOL */

  function volumeText(line, quantities) {
    const b = line.basis;
    const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('id-ID');
    if (b === 'wall_core') return 'Luas dinding bata/hebel (dinding beton tidak termasuk); dinding dua muka dibagi 2';
    if (b === 'wall_core_brick') return 'Luas dinding bata (menurut nama/material dinding); dinding dua muka dibagi 2';
    if (b === 'wall_core_aac') return 'Luas dinding hebel/bata ringan (menurut nama/material dinding); dinding dua muka dibagi 2';
    if (b === 'floor_tile') return 'Luas lantai keramik';
    if (b === 'floor_granite') return 'Luas lantai granit';
    if (b === 'floor_homogeneous') return 'Luas lantai homogenous tile';
    if (b === 'floor_parquet') return 'Luas lantai kayu/parket';
    if (b === 'floor_carpet') return 'Luas lantai karpet';
    if (b === 'floor_other' || b === 'roof_other') return 'Luas menurut material di model; harga diisi arsitek';
    if (b === 'roof_framed') return 'Luas atap genteng/metal (miring, sebenarnya)';
    if (b === 'roof_tile') return 'Luas atap genteng (miring, sebenarnya)';
    if (b === 'roof_metal') return 'Luas atap metal (miring, sebenarnya)';
    if (b === 'roof_concrete') return 'Luas dak beton atap';
    if (b === 'railing') return 'Panjang railing dari model';
    if (b === 'stair') return 'Tangga non-beton dari model, per tipe';
    if (b === 'casework') return 'Panjang kabinet/kitchen set dari model (sisi terpanjang)';
    if (b === 'wall_finish') return 'Luas muka dinding yang tidak dikeramik (kedua sisi)';
    if (b === 'wall_tiled') return 'Luas muka dinding berkeramik';
    if (b === 'floor') return 'Luas lantai';
    if (b === 'floor_perimeter') return 'Keliling lantai/ruang (plint)';
    if (b === 'ceiling') return 'Luas plafon';
    if (b === 'roof') return 'Luas atap (miring, sebenarnya)';
    if (b === 'opening_perimeter') return 'Panjang kusen: 2 × (lebar + tinggi) per unit';
    if (b === 'door_area') return 'Luas daun pintu: lebar × tinggi';
    if (b === 'window_area') return 'Luas kaca jendela: lebar × tinggi';
    if (/^concrete_/.test(b)) return 'Volume beton dari elemen struktur';
    if (/^formwork_/.test(b)) return 'Luas bidang kontak bekisting (sisi, dan dasar balok/pelat)';
    if (/^rebar_/.test(b)) return 'Berat tulangan: dari model, atau rasio kg/m³ beton bila tidak dimodelkan';
    if (b === 'concrete') return `Seluruh beton struktur (${fmt(quantities && quantities.concrete)} m³)`;
    if (b === 'steel') return 'Berat baja profil: volume × 7.850 kg/m³';
    if (b === 'mep') return 'Dihitung dari elemen MEP di model';
    if (b === 'demolition') return 'Elemen yang dibongkar pada fase ini';
    if (b === 'landscape') return 'Luas bidang lansekap (perkerasan / taman) dari model';
    return '';
  }

  function volSheet(lines, rab, takeoff) {
    const s = sheet('VOL', [6, 50, 46, 14, 9]);
    s.add([{ v: 'PERHITUNGAN VOLUME', s: 'title' }]);
    s.add([{ v: 'Diukur dari model oleh Dirory. Periksa sebelum dipakai untuk tender.', s: 'note' }]);
    s.gap();
    s.add(['No', 'Uraian Pekerjaan', 'Perhitungan', 'Volume', 'Satuan'].map((v) => ({ v: v, s: 'header' })));
    const ref = new Map();
    lines.forEach((l, i) => {
      const r = s.add([{ v: i + 1, s: 'number' }, { v: l.name, s: 'wrap' }, { v: volumeText(l, rab.quantities), s: 'wrap' },
        { v: Number(l.quantity) || 0, s: 'number' }, { v: l.unit, s: 'wrap' }]);
      ref.set(l.id, `VOL!$D$${r}`);
    });
    // The measured figures behind the volumes.
    const t = takeoff || {};
    const table = (title, head, rows) => {
      if (!rows.length) return;
      s.gap();
      s.add([{ v: title, s: 'bold' }]);
      s.add(head.map((v) => ({ v: v, s: 'header' })));
      rows.forEach((r) => s.add(r.map((v) => (typeof v === 'number' ? { v: v, s: 'number' } : { v: v, s: 'wrap' }))));
    };
    s.gap();
    s.add([{ v: 'RINCIAN DARI MODEL', s: 'title' }]);
    table('Luas per elemen dan material', ['', 'Material', 'Elemen', 'Luas (m²)', ''],
      (t.rows || []).map((r) => ['', r.material, r.element + (r.core === 'concrete' ? ' (beton)' : ''), Number(r.area_m2) || 0, 'm2']));
    table('Pintu dan jendela', ['', 'Tipe', 'Lebar × tinggi (m)', 'Jumlah', ''],
      (t.openings || []).map((o) => ['', o.name, `${o.width_m} × ${o.height_m} (${o.kind})`, Number(o.count) || 0, 'unit']));
    table('Struktur per tipe', ['', 'Tipe', 'Beton m³ / bekisting m² / tulangan kg', 'Jumlah', ''],
      (t.structure || []).map((m) => ['', `${m.member}: ${m.name}`,
        m.steel_kg > 0 ? `baja ${m.steel_kg} kg` : `${m.concrete_m3} / ${m.formwork_m2} / ${m.rebar_kg > 0 ? m.rebar_kg : 'rasio'}`,
        Number(m.count) || 0, 'unit']));
    table('MEP', ['', 'Elemen', 'Sistem · material · ukuran', 'Jumlah', 'Satuan'],
      (t.mep || []).map((m) => ['', `${m.group}: ${m.name}`, [m.system, m.material, m.size_mm ? `Ø${m.size_mm} mm` : ''].filter(Boolean).join(' · '),
        Number(m.quantity) || 0, m.unit]));
    table('Pembongkaran', ['', 'Elemen', 'Kelompok', 'Jumlah', 'Satuan'],
      (t.demolition || []).map((d) => ['', d.name, d.group, Number(d.quantity) || 0, d.unit]));
    if (t.floor_perimeter_m) table('Keliling lantai', ['', '', '', 'Panjang', ''], [['', 'Keliling ruang (plint)', '', Number(t.floor_perimeter_m), 'm']]);
    return { sheet: s, ref: ref };
  }

  /* ------------------------------------------------------------ RAB */

  function rabSheet(lines, ahsRef, volRef, project, book, date, labels) {
    const s = sheet('RAB', [6, 58, 12, 9, 18, 20, 30]);
    s.add([{ v: 'RENCANA ANGGARAN BIAYA (RAB)', s: 'title' }]);
    s.add([{ v: project || 'Proyek', s: 'bold' }]);
    s.add([{ v: `${book.name || ''} · ${date}`, s: 'note' }]);
    s.gap();
    s.add(['No', 'Uraian Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Jumlah Harga (Rp)', 'Keterangan'].map((v) => ({ v: v, s: 'header' })));
    s.freezeRow = 5;
    const divisions = [];
    let letter = 0;
    ORDER.forEach((element) => {
      const mine = lines.filter((l) => l.element === element);
      if (!mine.length) return;
      const code = String.fromCharCode(65 + letter++);
      const label = labels[element] || DIVISIONS[element];
      s.add([{ v: code, s: 'section' }, { v: label, s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' },
        { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
      let first = 0;
      let value = 0;
      let n = 0;
      let lastSection = '';
      mine.forEach((l) => {
        if (element === 'mep' && l.section && l.section !== lastSection) {
          lastSection = l.section;
          s.add([null, { v: MEP_SECTIONS[l.section] || l.section, s: 'bold' }]);
        }
        const r = s.rows.length + 1;
        const qty = Number(l.quantity) || 0;
        const ahs = l.key && !l.custom && !l.needs_price ? ahsRef.get(l.key) : null;
        let price;
        let note;
        if (l.needs_price) {
          price = { v: null, s: 'input' };
          note = 'Belum ada harga: isi harga satuan';
        } else if (l.custom) {
          price = { v: Number(l.unit_price) || 0, s: 'input' };
          note = 'Harga dari arsitek';
        } else if (ahs) {
          price = { f: ahs.ref, v: ahs.value, s: 'money' };
          note = isMarket(l) ? 'Harga pasar' : String(l.reference || '').replace(/^SE Dirjen Binkon No\. /, 'SE ');
        } else {
          price = { v: Number(l.unit_price) || 0, s: 'money' };
          note = l.reference || '';
        }
        const priceValue = typeof price.v === 'number' ? price.v : 0;
        s.add([{ v: ++n, s: 'number' }, { v: l.name, s: 'wrap' },
          volRef.has(l.id) ? { f: volRef.get(l.id), v: qty, s: 'number' } : { v: qty, s: 'number' },
          { v: l.unit, s: 'wrap' }, price, { f: `C${r}*E${r}`, v: qty * priceValue, s: 'money' }, { v: note, s: 'note' }]);
        if (!first) first = r;
        value += qty * priceValue;
      });
      const last = s.rows.length;
      const sub = s.add([null, { v: `Jumlah ${label.toLowerCase()}`, s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' },
        { v: '', s: 'section' }, { f: `SUM(F${first}:F${last})`, v: value, s: 'sectionMoney' }, { v: '', s: 'section' }]);
      s.gap();
      divisions.push({ code: code, label: label, ref: `RAB!$F$${sub}`, value: value });
    });
    return { sheet: s, divisions: divisions };
  }

  /* ---------------------------------------------------------- REKAP */

  function rekapSheet(divisions, project, book, date, floorArea) {
    const s = sheet('REKAP', [6, 52, 20, 10]);
    s.add([{ v: 'REKAPITULASI RENCANA ANGGARAN BIAYA', s: 'title' }]);
    s.add([{ v: project || 'Proyek', s: 'bold' }]);
    s.add([{ v: `${book.name || ''} · ${date}`, s: 'note' }]);
    s.gap();
    s.add(['No', 'Uraian Pekerjaan', 'Jumlah Harga (Rp)', '%'].map((v) => ({ v: v, s: 'header' })));
    const total = divisions.reduce((a, d) => a + d.value, 0);
    const firstRow = s.rows.length + 1;
    const totalRow = firstRow + divisions.length;
    divisions.forEach((d) => {
      const r = s.rows.length + 1;
      s.add([{ v: d.code, s: 'number' }, { v: d.label, s: 'wrap' }, { f: d.ref, v: d.value, s: 'money' },
        { f: `IF($C$${totalRow}=0,0,C${r}/$C$${totalRow})`, v: total ? d.value / total : 0, s: 'percent' }]);
    });
    s.add([{ v: '', s: 'total' }, { v: 'JUMLAH', s: 'total' },
      { f: divisions.length ? `SUM(C${firstRow}:C${totalRow - 1})` : '0', v: total, s: 'total' }, { v: total ? 1 : 0, f: `IF(C${totalRow}=0,0,1)`, s: 'percent' }]);
    const ppnRow = s.add([null, { v: 'PPN (efektif 11%: 12% × DPP 11/12; ubah bila perlu)', s: 'wrap' },
      { f: `C${totalRow}*D${s.rows.length + 1}`, v: total * PPN_DEFAULT, s: 'money' }, { v: PPN_DEFAULT, s: 'inputPercent' }]);
    const grandRow = s.add([{ v: '', s: 'total' }, { v: 'TOTAL TERMASUK PPN', s: 'total' },
      { f: `C${totalRow}+C${ppnRow}`, v: total * (1 + PPN_DEFAULT), s: 'total' }, { v: '', s: 'total' }]);
    s.add([null, { v: 'DIBULATKAN', s: 'bold' }, { f: `ROUNDDOWN(C${grandRow},-3)`, v: Math.floor(total * (1 + PPN_DEFAULT) / 1000) * 1000, s: 'moneyBold' }]);
    s.gap();
    const areaRow = s.add([null, { v: 'Luas lantai (m²) — dari model, ubah bila perlu', s: 'wrap' }, { v: round2(floorArea || 0), s: 'input' }]);
    s.add([null, { v: 'Harga per m² (termasuk PPN)', s: 'bold' },
      { f: `IF(C${areaRow}=0,0,C${grandRow}/C${areaRow})`, v: floorArea ? total * (1 + PPN_DEFAULT) / floorArea : 0, s: 'moneyBold' }]);
    s.gap();
    s.add([null, { v: 'Harga satuan sudah termasuk biaya umum dan keuntungan (lihat HARGA UPAH BAHAN). Volume diukur dari model; periksa sebelum tender.', s: 'note' }]);
    return s;
  }

  /* -------------------------------------------------------- CATATAN */

  function notesSheet(rab, book, takeoff, options) {
    const s = sheet('CATATAN', [4, 110]);
    s.add([{ v: 'CATATAN DAN ASUMSI', s: 'title' }]);
    s.gap();
    const notes = [
      `Harga: ${book.name || ''}. ${book.source || ''}`,
      `Harga satuan pekerjaan = (tenaga kerja + bahan + peralatan) × (1 + ${(Number(book.overhead_pct) || 15)}% biaya umum dan keuntungan), sesuai Permen PUPR 8/2023. PPN dihitung di REKAP.`,
      takeoff && takeoff.phase ? 'Fase Revit: pekerjaan baru dihitung, elemen eksisting tidak, elemen yang dibongkar masuk Pekerjaan Pembongkaran.' : '',
      ...(options.notes || []),
      rab.unpriced ? `${rab.unpriced} item belum ada harganya (kolom kuning di RAB): isi harga satuan dari penawaran.` : '',
      rab.lines.some((l) => l.custom) ? 'Item bertanda "Harga dari arsitek" memakai harga yang diisi arsitek, bukan AHS.' : '',
      rab.lines.some((l) => isMarket(l)) ? 'AC split memakai harga pasar (unit + pemasangan), karena tidak ada AHSP-nya.' : '',
      'Volume diukur otomatis dari model oleh Dirory dan merupakan perkiraan. Periksa volume dan spesifikasi bersama quantity surveyor sebelum tender.',
      'Sel kuning dapat diubah: harga dasar, persentase, PPN dan luas lantai. Rumus di seluruh workbook akan mengikuti.',
    ].filter(Boolean);
    notes.forEach((n, i) => s.add([{ v: i + 1, s: 'number' }, { v: n, s: 'wrap' }]));
    return s;
  }

  /* ---------------------------------------------------------- build */

  function buildRabWorkbook(input) {
    const rab = input.rab;
    const book = input.book || {};
    const takeoff = input.takeoff || {};
    const date = input.date || new Date().toISOString().slice(0, 10);
    const lines = rab.lines.slice();
    const items = new Map((book.items || []).map((it) => [it.key, it]));

    // The analyses the RAB uses, in RAB order, on the sheet of their element.
    const used = [];
    const seen = new Set();
    ORDER.forEach((element) => lines.filter((l) => l.element === element).forEach((l) => {
      if (!l.key || l.custom || l.needs_price || seen.has(l.key)) return;
      const it = items.get(l.key);
      if (!it || !(it.components || []).length) return;
      seen.add(l.key);
      used.push({ element: element, item: it });
    }));

    const prices = pricesSheet(used.map((u) => u.item), book);
    const ahsSheets = new Map();
    const ahsRef = new Map();
    used.forEach(({ element, item }) => {
      const name = AHS_SHEET[element] || 'AHS ARS';
      if (!ahsSheets.has(name)) {
        const s = sheet(name, [6, 50, 12, 9, 11, 17, 17]);
        s.add([{ v: 'ANALISA HARGA SATUAN PEKERJAAN', s: 'title' }]);
        s.add([{ v: `${name.replace('AHS ', '')} · ${book.name || ''}`, s: 'note' }]);
        s.gap();
        ahsSheets.set(name, s);
      }
      ahsRef.set(item.key, ahsBlock(ahsSheets.get(name), item, prices));
    });

    const vol = volSheet(lines, rab, takeoff);
    const rabS = rabSheet(lines, ahsRef, vol.ref, input.project, book, date, input.labels || {});
    const floorArea = (takeoff.totals && takeoff.totals.floor) || (rab.quantities && rab.quantities.floor) || 0;
    const rekap = rekapSheet(rabS.divisions, input.project, book, date, floorArea);

    const sheets = [rekap, rabS.sheet];
    ['AHS BONGKAR', 'AHS STR', 'AHS ARS', 'AHS MEP'].forEach((n) => { if (ahsSheets.has(n)) sheets.push(ahsSheets.get(n)); });
    sheets.push(prices.sheet, vol.sheet, notesSheet(rab, book, takeoff, input));
    return {
      title: `RAB ${input.project || ''}`.trim(),
      sheets: sheets.map((s) => ({ name: s.name, cols: s.cols, rows: s.rows, merges: s.merges, freezeRow: s.freezeRow })),
      total: rabS.divisions.reduce((a, d) => a + d.value, 0),
    };
  }

  const api = { buildRabWorkbook: buildRabWorkbook, DIVISIONS: DIVISIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryRabXlsx = api;
})(typeof window !== 'undefined' ? window : this);
