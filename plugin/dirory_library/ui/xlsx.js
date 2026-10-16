/* Dirory — a minimal .xlsx writer.
 *
 * Enough of Office Open XML for the RAB workbook: several sheets, numbers,
 * text, formulas (with their computed value cached, so the file reads right
 * before Excel recalculates), a handful of styles, column widths and merged
 * cells. Written by hand so the panel needs no library, in SketchUp, Revit or
 * a browser. The zip is "stored" (not compressed), which every spreadsheet
 * application reads.
 *
 *   const bytes = DiroryXlsx.write({
 *     sheets: [{ name, cols: [12, 40], merges: ['A1:F1'],
 *                rows: [[{ v: 'Title', s: 'title' }], [1, { f: 'A2*2', v: 2 }]] }],
 *   });
 *
 * A cell is a number, a string, null, or { v, f, s }: value, formula (without
 * '=') and style name (see STYLES).
 */
(function (root) {
  'use strict';

  // Style names -> cellXfs index. Order must match cellXfs in stylesXml().
  const STYLES = {
    default: 0, bold: 1, money: 2, number: 3, header: 4, title: 5, percent: 6,
    note: 7, moneyBold: 8, total: 9, section: 10, sectionMoney: 11, input: 12, inputPercent: 13, wrap: 14,
  };

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // XML 1.0 forbids most control characters.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function colName(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function cellXml(cell, ref) {
    if (cell === null || cell === undefined || cell === '') return '';
    const c = typeof cell === 'object' ? cell : { v: cell };
    const s = c.s ? ` s="${STYLES[c.s] || 0}"` : '';
    const v = c.v;
    if (c.f) {
      const f = `<f>${esc(c.f)}</f>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}>${f}<v>${v}</v></c>`;
      if (typeof v === 'string') return `<c r="${ref}"${s} t="str">${f}<v>${esc(v)}</v></c>`;
      return `<c r="${ref}"${s}>${f}</c>`;
    }
    if (typeof v === 'number') return isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : '';
    if (v === null || v === undefined || v === '') return c.s ? `<c r="${ref}"${s}/>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const cols = (sheet.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rows = (sheet.rows || []).map((row, r) => {
      if (!row || !row.length) return '';
      const cells = row.map((cell, c) => cellXml(cell, colName(c) + (r + 1))).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    }).join('');
    const merges = (sheet.merges || []).length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    const freeze = sheet.freezeRow
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      freeze + (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${rows}</sheetData>` + merges +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  function stylesXml() {
    // numFmt 164: #,##0 (rupiah), 165: #,##0.00 (volumes), 166: 0.0%
    const font = (b, sz, color, i) => `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/><color rgb="${color}"/><name val="Calibri"/></font>`;
    const xf = (numFmt, font, fill, border, extra) =>
      `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${numFmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
      (extra ? ` applyAlignment="1">${extra}</xf>` : '/>');
    const fill = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
    const thin = '<left style="thin"><color rgb="FFB7BCD3"/></left><right style="thin"><color rgb="FFB7BCD3"/></right>' +
      '<top style="thin"><color rgb="FFB7BCD3"/></top><bottom style="thin"><color rgb="FFB7BCD3"/></bottom>';
    const wrap = '<alignment wrapText="1" vertical="top"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/>' +
      '<numFmt numFmtId="166" formatCode="0.0%"/></numFmts>' +
      `<fonts count="5">${font(false, 10, 'FF1C1C1E')}${font(true, 10, 'FF1C1C1E')}${font(true, 14, 'FF39509F')}` +
      `${font(false, 9, 'FF6B6B70', true)}${font(true, 10, 'FFFFFFFF')}</fonts>` +
      `<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `${fill('FFE9ECF5')}${fill('FF39509F')}${fill('FFF4F5F9')}${fill('FFFFF7D6')}</fills>` +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}<diagonal/></border></borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="15">' +
      xf(0, 0, 0, 0) +            // 0 default
      xf(0, 1, 0, 0) +            // 1 bold
      xf(164, 0, 0, 1) +          // 2 money
      xf(165, 0, 0, 1) +          // 3 number
      xf(0, 4, 3, 1, wrap) +      // 4 header (white on brand blue)
      xf(0, 2, 0, 0) +            // 5 title
      xf(166, 0, 0, 1) +          // 6 percent
      xf(0, 3, 0, 0, wrap) +      // 7 note
      xf(164, 1, 0, 1) +          // 8 money bold
      xf(164, 1, 2, 1) +          // 9 total (bold, light fill)
      xf(0, 1, 4, 1) +            // 10 section label
      xf(164, 1, 4, 1) +          // 11 section money
      xf(164, 0, 5, 1) +          // 12 input (editable, yellow)
      xf(166, 0, 5, 1) +          // 13 input percent
      xf(0, 0, 0, 1, wrap) +      // 14 bordered wrapped text
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function workbookXml(sheets) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  }

  function files(book) {
    const sheets = book.sheets;
    const out = [];
    out.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>']);
    out.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>']);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    out.push(['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(book.title || 'Dirory')}</dc:title><dc:creator>Dirory</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`]);
    out.push(['xl/workbook.xml', workbookXml(sheets)]);
    out.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>']);
    out.push(['xl/styles.xml', stylesXml()]);
    sheets.forEach((s, i) => out.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]));
    return out;
  }

  /* ------------------------------------------------------- stored zip */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    return Uint8Array.from(Buffer.from(text, 'utf8'));
  }

  function zip(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
    const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    // DOS date/time of "now" for every entry.
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    entries.forEach(([name, text]) => {
      const nameBytes = utf8(name);
      const data = utf8(text);
      const crc = crc32(data);
      const header = Uint8Array.from([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
      ]);
      parts.push(header, nameBytes, data);
      central.push(Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]), nameBytes);
      offset += header.length + nameBytes.length + data.length;
    });
    const centralSize = central.reduce((s, p) => s + p.length, 0);
    const end = Uint8Array.from([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
      ...u32(centralSize), ...u32(offset), ...u16(0),
    ]);
    const all = parts.concat(central, [end]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let at = 0;
    all.forEach((p) => { out.set(p, at); at += p.length; });
    return out;
  }

  function write(book) {
    return zip(files(book));
  }

  function toBase64(bytes) {
    if (typeof btoa === 'undefined') return Buffer.from(bytes).toString('base64');
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  const api = { write: write, toBase64: toBase64, colName: colName, STYLES: STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiroryXlsx = api;
})(typeof window !== 'undefined' ? window : this);
