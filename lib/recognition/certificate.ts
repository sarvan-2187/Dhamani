// PRD 11: the donation certificate, an A4 PDF made with pdf-lib on the server. Donor name, date, blood centre and
// request code only: never patient data. English only (pdf-lib cannot lay out Tamil or Telugu), so the name is the
// donor's English spelling (rules.ts CERT_NAME_RE).
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { BRAND_HEX, MARK_CELLS } from "../brand";

export type CertificateInput = { name: string; date: string; centre: string; code: string };

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
/** The standard PDF fonts only cover Latin-1: drop accents and anything else rather than fail. */
const latin = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

export async function buildCertificate(c: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Dhamani donation certificate ${c.code}`);
  pdf.setAuthor("Dhamani");
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = hex(BRAND_HEX.ink);
  const muted = hex(BRAND_HEX.inkMuted);

  const centred = (text: string, y: number, size: number, font = regular, color = ink) => {
    const t = latin(text);
    let s = size; // shrink long lines (long centre names) to fit inside the margins
    while (s > 9 && font.widthOfTextAtSize(t, s) > width - 120) s -= 1;
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
  };

  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: hex(BRAND_HEX.border), borderWidth: 1.5 });

  // The three-cell mark (lib/brand.ts) at 64 pt, centred. PDF y grows upwards, so the 32-unit grid is flipped.
  const scale = 2;
  const at = (x: number, y: number) => ({ x: width / 2 + (x - 16) * scale, y: 700 + (32 - y) * scale });
  for (const cell of MARK_CELLS) {
    const rotate = degrees(-cell.rotate);
    page.drawEllipse({ ...at(cell.cx, cell.cy), xScale: cell.rx * scale, yScale: cell.ry * scale, rotate, color: hex(BRAND_HEX.brand) });
    page.drawEllipse({ ...at(cell.dimple.cx, cell.dimple.cy), xScale: cell.dimple.rx * scale, yScale: cell.dimple.ry * scale, rotate, color: hex(BRAND_HEX.brandDeep) });
  }

  centred("Dhamani", 660, 22, bold);
  centred("Certificate of blood donation", 590, 28, bold);
  centred("This certifies that", 530, 14, regular, muted);
  centred(c.name, 490, 32, bold);
  centred("donated blood at", 448, 14, regular, muted);
  centred(c.centre, 418, 18, bold);
  centred(`on ${c.date}, for request ${c.code}.`, 388, 14);
  centred("The donor and the family who asked for blood both confirmed this donation.", 320, 11, regular, muted);
  centred("Thank you.", 270, 18, bold);
  centred("Dhamani connects families who need blood with nearby eligible donors.", 90, 10, regular, muted);

  return pdf.save();
}
