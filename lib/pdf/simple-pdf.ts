/**
 * Minimal PDF 1.4 generator (text only, Helvetica) – no external deps.
 * Good enough for tabular EnergyPulse reports.
 */

function escapePdf(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Strip non-latin1 for core fonts
    .replace(/[^\x20-\x7EÅÄÖåäöéÉüÜ]/g, "?")
    .replace(/Å/g, "A")
    .replace(/Ä/g, "A")
    .replace(/Ö/g, "O")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o");
}

export type PdfLine =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "text"; text: string }
  | { type: "space"; h?: number }
  | { type: "row"; cells: string[]; widths?: number[] };

/**
 * Build a multi-page A4 portrait PDF from lines.
 */
export function buildSimplePdf(lines: PdfLine[]): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;
  const pages: string[] = [];

  let content = "";
  let y = pageHeight - margin;

  const flushPage = () => {
    pages.push(content);
    content = "";
    y = pageHeight - margin;
  };

  const ensureSpace = (need: number) => {
    if (y - need < margin) flushPage();
  };

  const writeText = (
    text: string,
    size: number,
    x: number,
    bold = false
  ) => {
    ensureSpace(size + 4);
    const font = bold ? "F2" : "F1";
    content += `BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapePdf(text)}) Tj ET\n`;
    y -= size + 4;
  };

  for (const line of lines) {
    if (line.type === "space") {
      y -= line.h ?? 10;
      continue;
    }
    if (line.type === "title") {
      writeText(line.text, 16, margin, true);
      y -= 4;
      continue;
    }
    if (line.type === "subtitle") {
      writeText(line.text, 11, margin, true);
      continue;
    }
    if (line.type === "text") {
      // Word-wrap roughly by char count
      const maxChars = Math.floor(maxWidth / 5);
      let rest = line.text;
      while (rest.length > maxChars) {
        writeText(rest.slice(0, maxChars), 9, margin);
        rest = rest.slice(maxChars);
      }
      writeText(rest, 9, margin);
      continue;
    }
    if (line.type === "row") {
      ensureSpace(12);
      const cells = line.cells;
      const n = cells.length;
      const widths =
        line.widths ??
        Array.from({ length: n }, () => maxWidth / n);
      let x = margin;
      content += "BT\n";
      for (let i = 0; i < n; i++) {
        const w = widths[i] ?? maxWidth / n;
        const cell = cells[i] ?? "";
        const maxC = Math.max(4, Math.floor(w / 4.5));
        const t = cell.length > maxC ? cell.slice(0, maxC - 1) + "…" : cell;
        content += `/F1 8 Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapePdf(t)}) Tj\n`;
        // next cell: relative Td is cumulative in same BT if we reset Tm - use absolute via Tm
        content += `1 0 0 1 ${(x + w).toFixed(1)} ${y.toFixed(1)} Tm\n`;
        x += w;
      }
      content += "ET\n";
      y -= 11;
    }
  }

  if (content || pages.length === 0) flushPage();

  // Assemble PDF objects
  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");

  const kids: string[] = [];
  const pageObjStart = 4; // after catalog, pages, fonts
  // We'll place: 1 catalog, 2 pages, 3 F1, 4 F2, then content streams + page objects

  // Fonts
  objects.push(
    "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
  );
  objects.push(
    "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n"
  );

  const contentObjs: number[] = [];
  const pageObjs: number[] = [];
  let nextId = 5;

  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i]!;
    const contentId = nextId++;
    contentObjs.push(contentId);
    objects.push(
      `${contentId} 0 obj<< /Length ${stream.length} >>stream\n${stream}endstream\nendobj\n`
    );

    const pageId = nextId++;
    pageObjs.push(pageId);
    objects.push(
      `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>endobj\n`
    );
    kids.push(`${pageId} 0 R`);
  }

  // Pages object must be index 2 - rebuild objects array carefully
  const pagesObj = `2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>endobj\n`;

  // Rebuild full object list in order by number is hard; use sequential write with xref
  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];

  const allObjs: Array<{ id: number; body: string }> = [
    { id: 1, body: "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n" },
    { id: 2, body: pagesObj },
    {
      id: 3,
      body: "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    },
    {
      id: 4,
      body: "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n",
    },
  ];

  // re-emit content and pages
  nextId = 5;
  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i]!;
    const contentId = nextId++;
    allObjs.push({
      id: contentId,
      body: `${contentId} 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}endstream\nendobj\n`,
    });
    const pageId = nextId++;
    // fix kids - already computed with sequential ids starting 5: content 5, page 6, content 7, page 8...
    allObjs.push({
      id: pageId,
      body: `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>endobj\n`,
    });
  }

  // Fix pages kids with actual page ids
  const actualPageIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    actualPageIds.push(6 + i * 2); // 6, 8, 10...
  }
  allObjs[1] = {
    id: 2,
    body: `2 0 obj<< /Type /Pages /Kids [${actualPageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>endobj\n`,
  };

  for (const obj of allObjs) {
    offsets[obj.id] = Buffer.byteLength(parts.join(""), "utf8");
    parts.push(obj.body);
  }

  const maxId = allObjs[allObjs.length - 1]!.id;
  const xrefPos = Buffer.byteLength(parts.join(""), "utf8");
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

  return new Uint8Array(Buffer.from(parts.join(""), "utf8"));
}

export function pdfToBase64(pdf: Uint8Array): string {
  return Buffer.from(pdf).toString("base64");
}
