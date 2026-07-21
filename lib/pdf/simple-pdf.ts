/**
 * Lightweight PDF 1.4 generator – no external deps.
 * WinAnsi Helvetica with Swedish ÅÄÖ, branded header, tables, page numbers.
 */

/** Map Unicode → WinAnsi / safe substitutes for Helvetica. */
function toWinAnsiChar(code: number): string | null {
  if (code >= 0x20 && code <= 0x7e) {
    const ch = String.fromCharCode(code);
    if (ch === "\\") return "\\\\";
    if (ch === "(") return "\\(";
    if (ch === ")") return "\\)";
    return ch;
  }
  // Common Swedish / Latin-1
  const map: Record<number, number> = {
    0x00c5: 0xc5, // Å
    0x00c4: 0xc4, // Ä
    0x00d6: 0xd6, // Ö
    0x00e5: 0xe5, // å
    0x00e4: 0xe4, // ä
    0x00f6: 0xf6, // ö
    0x00c9: 0xc9, // É
    0x00e9: 0xe9, // é
    0x00dc: 0xdc, // Ü
    0x00fc: 0xfc, // ü
    0x00d8: 0xd8, // Ø
    0x00f8: 0xf8, // ø
    0x00c6: 0xc6, // Æ
    0x00e6: 0xe6, // æ
    0x00b0: 0xb0, // °
    0x00b2: 0xb2, // ²
    0x00b7: 0xb7, // ·
    0x00d7: 0xd7, // ×
    0x2013: 0x2d, // –
    0x2014: 0x2d, // —
    0x2018: 0x27,
    0x2019: 0x27,
    0x201c: 0x22,
    0x201d: 0x22,
    0x2026: 0x2e, // …
    0x2022: 0xb7, // •
    0x2192: 0x3e, // →
    0x00a0: 0x20,
  };
  const mapped = map[code];
  if (mapped == null) return null;
  if (mapped >= 0x20 && mapped <= 0x7e) {
    const ch = String.fromCharCode(mapped);
    if (ch === "\\") return "\\\\";
    if (ch === "(") return "\\(";
    if (ch === ")") return "\\)";
    return ch;
  }
  return "\\" + mapped.toString(8).padStart(3, "0");
}

export function escapePdf(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      out += "?";
      continue;
    }
    const enc = toWinAnsiChar(code);
    out += enc ?? "?";
  }
  return out;
}

export type PdfLine =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "text"; text: string }
  | { type: "space"; h?: number }
  | { type: "row"; cells: string[]; widths?: number[] }
  | {
      type: "brand_header";
      title: string;
      subtitle?: string;
      meta?: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      widths?: number[];
    }
  | { type: "hrule" }
  | { type: "kpi_row"; items: Array<{ label: string; value: string }> }
  | { type: "bullet"; text: string }
  | { type: "signature" };

export type BuildPdfOptions = {
  /** Footer left text (default EnergyPulse) */
  footerLeft?: string;
  /** Skip automatic page numbers */
  noPageNumbers?: boolean;
};

const BRAND = {
  r: 0.07,
  g: 0.42,
  b: 0.38, // teal-green
};
const BRAND_LIGHT = {
  r: 0.9,
  g: 0.95,
  b: 0.94,
};
const HEADER_BG = {
  r: 0.96,
  g: 0.97,
  b: 0.98,
};
const TABLE_HEADER_BG = {
  r: 0.12,
  g: 0.28,
  b: 0.32,
};
const TABLE_ALT = {
  r: 0.96,
  g: 0.97,
  b: 0.97,
};

/**
 * Build a multi-page A4 portrait PDF from lines.
 */
export function buildSimplePdf(
  lines: PdfLine[],
  options: BuildPdfOptions = {}
): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  const bottomMargin = 52;
  const pages: string[] = [];

  let content = "";
  let y = pageHeight - margin;

  const flushPage = () => {
    pages.push(content);
    content = "";
    y = pageHeight - margin;
  };

  const ensureSpace = (need: number) => {
    if (y - need < bottomMargin) flushPage();
  };

  const setFill = (c: { r: number; g: number; b: number }) => {
    content += `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} rg\n`;
  };

  const setStroke = (c: { r: number; g: number; b: number }) => {
    content += `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} RG\n`;
  };

  const rect = (
    x: number,
    yBot: number,
    w: number,
    h: number,
    fill: boolean,
    stroke = false
  ) => {
    content += `${x.toFixed(1)} ${yBot.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re\n`;
    if (fill && stroke) content += "B\n";
    else if (fill) content += "f\n";
    else content += "S\n";
  };

  const writeTextAt = (
    text: string,
    size: number,
    x: number,
    yPos: number,
    bold = false,
    color?: { r: number; g: number; b: number }
  ) => {
    const font = bold ? "F2" : "F1";
    if (color) {
      content += `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg\n`;
    } else {
      content += "0 0 0 rg\n";
    }
    content += `BT /${font} ${size} Tf ${x.toFixed(1)} ${yPos.toFixed(1)} Td (${escapePdf(text)}) Tj ET\n`;
  };

  const writeText = (
    text: string,
    size: number,
    x: number,
    bold = false,
    color?: { r: number; g: number; b: number }
  ) => {
    ensureSpace(size + 5);
    writeTextAt(text, size, x, y, bold, color);
    y -= size + 4;
  };

  const wrapText = (text: string, maxChars: number): string[] => {
    if (!text) return [""];
    const words = text.split(/\s+/);
    const linesOut: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) {
        linesOut.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) linesOut.push(cur);
    return linesOut.length ? linesOut : [""];
  };

  const drawBrandHeader = (
    title: string,
    subtitle?: string,
    meta?: string
  ) => {
    ensureSpace(78);
    // Top brand bar
    setFill(BRAND);
    rect(0, pageHeight - 28, pageWidth, 28, true);
    writeTextAt("EnergyPulse", 11, margin, pageHeight - 18, true, {
      r: 1,
      g: 1,
      b: 1,
    });
    writeTextAt("Energi · MEPS · CRREM · CSRD", 8, pageWidth - margin - 140, pageHeight - 17, false, {
      r: 0.85,
      g: 0.95,
      b: 0.93,
    });

    // Logo mark (simple leaf/circle)
    setFill({ r: 1, g: 1, b: 1 });
    content += `${(margin - 18).toFixed(1)} ${(pageHeight - 20).toFixed(1)} 6 6 re f\n`;

    y = pageHeight - 48;

    // Title block background
    const blockH = subtitle || meta ? 52 : 28;
    setFill(HEADER_BG);
    rect(margin - 4, y - blockH + 12, maxWidth + 8, blockH, true);
    setStroke(BRAND);
    content += "0.8 w\n";
    content += `${(margin - 4).toFixed(1)} ${(y - blockH + 12).toFixed(1)} ${
      maxWidth + 8
    } ${blockH} re S\n`;

    writeTextAt(title, 15, margin, y, true, BRAND);
    y -= 18;
    if (subtitle) {
      writeTextAt(subtitle, 9, margin, y, false, {
        r: 0.25,
        g: 0.28,
        b: 0.3,
      });
      y -= 13;
    }
    if (meta) {
      writeTextAt(meta, 8, margin, y, false, {
        r: 0.4,
        g: 0.42,
        b: 0.45,
      });
      y -= 14;
    }
    y -= 8;
  };

  const drawHrule = () => {
    ensureSpace(10);
    setStroke({ r: 0.75, g: 0.78, b: 0.8 });
    content += "0.5 w\n";
    content += `${margin.toFixed(1)} ${y.toFixed(1)} m ${(margin + maxWidth).toFixed(1)} ${y.toFixed(1)} l S\n`;
    y -= 10;
  };

  const drawTable = (
    headers: string[],
    rows: string[][],
    widths?: number[]
  ) => {
    const n = headers.length;
    const cols =
      widths ?? Array.from({ length: n }, () => maxWidth / Math.max(n, 1));
    const rowH = 14;
    const headerH = 16;

    const drawRow = (
      cells: string[],
      isHeader: boolean,
      alt: boolean
    ) => {
      ensureSpace(isHeader ? headerH + 4 : rowH + 2);
      const h = isHeader ? headerH : rowH;
      const yBot = y - h + 4;
      if (isHeader) {
        setFill(TABLE_HEADER_BG);
        rect(margin, yBot, maxWidth, h, true);
      } else if (alt) {
        setFill(TABLE_ALT);
        rect(margin, yBot, maxWidth, h, true);
      }
      let x = margin + 3;
      for (let i = 0; i < n; i++) {
        const w = cols[i] ?? maxWidth / n;
        const maxC = Math.max(3, Math.floor(w / 4.6));
        let cell = cells[i] ?? "";
        if (cell.length > maxC) cell = cell.slice(0, maxC - 1) + "…";
        writeTextAt(
          cell,
          isHeader ? 8 : 8,
          x,
          yBot + 4,
          isHeader,
          isHeader ? { r: 1, g: 1, b: 1 } : { r: 0.1, g: 0.12, b: 0.14 }
        );
        x += w;
      }
      y -= h;
    };

    drawRow(headers, true, false);
    rows.forEach((r, idx) => drawRow(r, false, idx % 2 === 1));
    y -= 6;
  };

  const drawKpiRow = (
    items: Array<{ label: string; value: string }>
  ) => {
    const count = Math.min(items.length, 4);
    if (count === 0) return;
    const gap = 8;
    const boxW = (maxWidth - gap * (count - 1)) / count;
    const boxH = 36;
    ensureSpace(boxH + 10);
    let x = margin;
    for (let i = 0; i < count; i++) {
      const it = items[i]!;
      setFill(BRAND_LIGHT);
      rect(x, y - boxH + 8, boxW, boxH, true);
      setStroke(BRAND);
      content += "0.6 w\n";
      content += `${x.toFixed(1)} ${(y - boxH + 8).toFixed(1)} ${boxW.toFixed(1)} ${boxH} re S\n`;
      writeTextAt(it.label, 7, x + 6, y - 2, false, {
        r: 0.35,
        g: 0.4,
        b: 0.42,
      });
      writeTextAt(it.value, 11, x + 6, y - 18, true, BRAND);
      x += boxW + gap;
    }
    y -= boxH + 10;
  };

  for (const line of lines) {
    if (line.type === "space") {
      y -= line.h ?? 10;
      continue;
    }
    if (line.type === "brand_header") {
      drawBrandHeader(line.title, line.subtitle, line.meta);
      continue;
    }
    if (line.type === "hrule") {
      drawHrule();
      continue;
    }
    if (line.type === "title") {
      writeText(line.text, 14, margin, true, BRAND);
      y -= 2;
      continue;
    }
    if (line.type === "subtitle") {
      ensureSpace(22);
      // Accent bar
      setFill(BRAND);
      rect(margin, y - 2, 3, 12, true);
      writeTextAt(line.text, 11, margin + 8, y, true, {
        r: 0.1,
        g: 0.15,
        b: 0.18,
      });
      y -= 16;
      continue;
    }
    if (line.type === "text") {
      const maxChars = Math.floor(maxWidth / 4.8);
      for (const part of wrapText(line.text, maxChars)) {
        writeText(part, 9, margin, false);
      }
      continue;
    }
    if (line.type === "bullet") {
      const maxChars = Math.floor((maxWidth - 14) / 4.8);
      const parts = wrapText(line.text, maxChars);
      parts.forEach((part, i) => {
        ensureSpace(13);
        if (i === 0) {
          writeTextAt("·", 10, margin, y, true, BRAND);
        }
        writeTextAt(part, 9, margin + 12, y, false);
        y -= 12;
      });
      continue;
    }
    if (line.type === "kpi_row") {
      drawKpiRow(line.items);
      continue;
    }
    if (line.type === "table") {
      drawTable(line.headers, line.rows, line.widths);
      continue;
    }
    if (line.type === "row") {
      // Legacy single row → mini table row without header
      ensureSpace(14);
      const cells = line.cells;
      const n = cells.length;
      const widths =
        line.widths ??
        Array.from({ length: n }, () => maxWidth / Math.max(n, 1));
      let x = margin;
      for (let i = 0; i < n; i++) {
        const w = widths[i] ?? maxWidth / n;
        const maxC = Math.max(4, Math.floor(w / 4.5));
        let cell = cells[i] ?? "";
        if (cell.length > maxC) cell = cell.slice(0, maxC - 1) + "…";
        writeTextAt(cell, 8, x, y, false);
        x += w;
      }
      y -= 12;
      continue;
    }
    if (line.type === "signature") {
      ensureSpace(48);
      writeText("Förvaltare: ____________________________    Datum: __________", 9, margin);
      writeText(
        "Beslut (godkänn / skjut upp / avslå): ______________________________",
        9,
        margin
      );
      continue;
    }
  }

  if (content || pages.length === 0) flushPage();

  // Post-process pages: add footer with page numbers
  const footerLeft = options.footerLeft ?? "EnergyPulse · Konfidentiellt beslutsunderlag";
  const stampedPages = pages.map((pageContent, idx) => {
    if (options.noPageNumbers) return pageContent;
    let foot = pageContent;
    // bottom bar
    foot += `${BRAND.r.toFixed(3)} ${BRAND.g.toFixed(3)} ${BRAND.b.toFixed(3)} rg\n`;
    foot += `0 0 ${pageWidth} 22 re f\n`;
    foot += `1 1 1 rg\n`;
    foot += `BT /F1 7 Tf ${margin.toFixed(1)} 8 Td (${escapePdf(footerLeft)}) Tj ET\n`;
    const pageLabel = `Sida ${idx + 1} av ${pages.length}`;
    foot += `BT /F1 7 Tf ${(pageWidth - margin - 70).toFixed(1)} 8 Td (${escapePdf(pageLabel)}) Tj ET\n`;
    return foot;
  });

  // Assemble PDF objects
  const allObjs: Array<{ id: number; body: string }> = [
    { id: 1, body: "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n" },
    { id: 2, body: "2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n" },
    {
      id: 3,
      body: "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>endobj\n",
    },
    {
      id: 4,
      body: "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>endobj\n",
    },
  ];

  let nextId = 5;
  const actualPageIds: number[] = [];
  for (let i = 0; i < stampedPages.length; i++) {
    const stream = stampedPages[i]!;
    const streamBytes = Buffer.byteLength(stream, "latin1");
    const contentId = nextId++;
    allObjs.push({
      id: contentId,
      body: `${contentId} 0 obj<< /Length ${streamBytes} >>stream\n${stream}endstream\nendobj\n`,
    });
    const pageId = nextId++;
    actualPageIds.push(pageId);
    allObjs.push({
      id: pageId,
      body: `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>endobj\n`,
    });
  }

  allObjs[1] = {
    id: 2,
    body: `2 0 obj<< /Type /Pages /Kids [${actualPageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${stampedPages.length} >>endobj\n`,
  };

  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let cursor = Buffer.byteLength(parts[0]!, "latin1");

  for (const obj of allObjs) {
    offsets[obj.id] = cursor;
    parts.push(obj.body);
    cursor += Buffer.byteLength(obj.body, "latin1");
  }

  const maxId = allObjs[allObjs.length - 1]!.id;
  const xrefPos = cursor;
  let xref = `xref\n0 ${maxId + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= maxId; i++) {
    const off = offsets[i] ?? 0;
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  parts.push(xref);
  parts.push(
    `trailer<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  );

  return new Uint8Array(Buffer.from(parts.join(""), "latin1"));
}

export function pdfToBase64(pdf: Uint8Array): string {
  return Buffer.from(pdf).toString("base64");
}
