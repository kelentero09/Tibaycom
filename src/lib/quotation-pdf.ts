'use client';

import { formatPHPAscii } from './money';
import { calculateQuotation, ITEM_TYPE_LABELS, type QuotationInput, type QuotationItem } from './quotation';

export type QuotationBranding = {
  businessName: string;
  addressLine: string;
  phone: string;
  email: string;
  /** Premium only: the server sends a logo URL only when the plan allows custom branding. */
  logoUrl: string | null;
  /** Free plans carry a small "Made with Tibay" footer. */
  showPlatformFooter: boolean;
};

export type QuotationDocument = QuotationInput & { number: string };

const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
// jsPDF's standard fonts are WinAnsi-only: swap the peso sign and drop anything outside Latin-1.
const safe = (text: string) => text.replace(/₱/g, 'PHP ').replace(/[^ -ÿ\n]/g, '');

async function loadLogo(url: string): Promise<{ data: string; format: 'PNG' | 'JPEG'; ratio: number } | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL('image/png'), format: 'PNG', ratio: bitmap.width / bitmap.height };
  } catch {
    return null;
  }
}

/** Builds the quotation PDF entirely in the browser (jsPDF is loaded on demand). */
export async function buildQuotationPdf(quotation: QuotationDocument, branding: QuotationBranding) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const right = pageWidth - margin;
  const totals = calculateQuotation(quotation);
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];

  // Header: business identity (left) and document meta (right)
  let y = margin;
  let textX = margin;
  const logo = branding.logoUrl ? await loadLogo(branding.logoUrl) : null;
  if (logo) {
    const height = 18;
    const width = Math.min(40, height * logo.ratio);
    doc.addImage(logo.data, logo.format, margin, y, width, width / logo.ratio);
    textX = margin + width + 5;
  }
  doc.setTextColor(...ink).setFont('helvetica', 'bold').setFontSize(15);
  doc.text(safe(branding.businessName), textX, y + 6, { maxWidth: 95 });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
  const contactLines = [branding.addressLine, branding.phone, branding.email].filter(Boolean).map(safe);
  doc.text(contactLines, textX, y + 11.5);

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...ink);
  doc.text('QUOTATION', right, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
  doc.text([`No. ${quotation.number}`, `Date: ${formatDate(quotation.issueDate)}`, `Valid until: ${formatDate(quotation.validUntil)}`], right, y + 11.5, { align: 'right' });

  y += Math.max(26, 11.5 + contactLines.length * 4 + 6);
  doc.setDrawColor(226, 232, 240).line(margin, y, right, y);
  y += 7;

  // Client block
  doc.setFontSize(8).setTextColor(...muted).text('PREPARED FOR', margin, y);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ink).text(safe(quotation.clientName), margin, y + 5.5);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
  const clientLines = doc.splitTextToSize(safe([quotation.clientAddress, quotation.clientContact].filter(Boolean).join('\n')), 100) as string[];
  if (clientLines.length) doc.text(clientLines, margin, y + 10.5);
  if (quotation.title) {
    doc.setFontSize(8).text('PROJECT', right, y, { align: 'right' });
    doc.setFontSize(10).setTextColor(...ink).text(safe(quotation.title), right, y + 5.5, { align: 'right', maxWidth: 80 });
  }
  y += 12 + clientLines.length * 4.2 + 4;

  // Line items, grouped by type
  const body: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
  (Object.keys(ITEM_TYPE_LABELS) as QuotationItem['type'][]).forEach((type) => {
    const rows = quotation.items.map((item, index) => ({ item, total: totals.lineTotals[index] ?? 0 })).filter((r) => r.item.type === type);
    if (!rows.length) return;
    body.push([{ content: ITEM_TYPE_LABELS[type].toUpperCase(), colSpan: 5, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: ink, fontSize: 8 } }]);
    rows.forEach(({ item, total }) => body.push([safe(item.description), String(item.quantity), safe(item.unit), formatPHPAscii(item.unitPrice), formatPHPAscii(total)]));
  });
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 22 },
    head: [['Description', 'Qty', 'Unit', 'Unit price', 'Amount']],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: ink, lineColor: [226, 232, 240], lineWidth: { bottom: 0.2 } as never },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 32 }, 4: { halign: 'right', cellWidth: 34 } },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 6;

  // Totals
  const totalRows: [string, string, boolean?][] = [['Subtotal', formatPHPAscii(totals.subtotal)]];
  if (totals.discountAmount > 0)
    totalRows.push([quotation.discountType === 'percent' ? `Discount (${quotation.discountValue / 100}%)` : 'Discount', `- ${formatPHPAscii(totals.discountAmount)}`]);
  if (quotation.taxRateBps > 0) totalRows.push([`VAT / Tax (${quotation.taxRateBps / 100}%)`, formatPHPAscii(totals.taxAmount)]);
  totalRows.push(['TOTAL', formatPHPAscii(totals.total), true]);
  if (y + totalRows.length * 6 + 10 > pageHeight - 22) {
    doc.addPage();
    y = margin;
  }
  totalRows.forEach(([label, value, strong]) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 12 : 9.5).setTextColor(...(strong ? ink : muted));
    if (strong) {
      doc.setDrawColor(...ink).line(right - 80, y - 1.5, right, y - 1.5);
      y += 4;
    }
    doc.text(label, right - 80, y);
    doc.setTextColor(...ink).text(value, right, y, { align: 'right' });
    y += strong ? 8 : 6;
  });

  // Terms & notes
  for (const [heading, content] of [['Payment terms', quotation.paymentTerms], ['Notes', quotation.notes]] as const) {
    if (!content) continue;
    const lines = doc.setFont('helvetica', 'normal').setFontSize(9).splitTextToSize(safe(content), pageWidth - margin * 2) as string[];
    if (y + 8 + lines.length * 4.2 > pageHeight - 22) {
      doc.addPage();
      y = margin;
    }
    y += 4;
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ink).text(heading, margin, y);
    doc.setFont('helvetica', 'normal').setTextColor(...muted).text(lines, margin, y + 5);
    y += 5 + lines.length * 4.2;
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted);
    doc.text(`${quotation.number} · Page ${page} of ${pages}`.replace('·', '-'), right, pageHeight - 10, { align: 'right' });
    if (branding.showPlatformFooter) doc.text('Made with Tibay - tibay.ph', margin, pageHeight - 10);
  }
  return doc;
}

export async function downloadQuotationPdf(quotation: QuotationDocument, branding: QuotationBranding) {
  const doc = await buildQuotationPdf(quotation, branding);
  doc.save(`${quotation.number}-${quotation.clientName.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`);
}

export async function previewQuotationPdf(quotation: QuotationDocument, branding: QuotationBranding) {
  const doc = await buildQuotationPdf(quotation, branding);
  return URL.createObjectURL(doc.output('blob'));
}
