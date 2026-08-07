import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { CertificateTemplateLayout } from "./certificate-pdf";

export interface CertificateImageParams {
  layout: CertificateTemplateLayout;
  recipientName: string;
  courseName: string;
  issuerName: string;
  credentialId: string;
  issuedAt: Date;
  qrDataUrl: string;
}

/** A4 landscape at ~96dpi, the same 1.414 aspect the PDF and its container use. */
const WIDTH = 1414;
const HEIGHT = 1000;

const FONT_DIR = "node_modules/@fontsource/geist-sans/files";

/**
 * Satori needs actual font bytes — it cannot resolve "Helvetica" by name the
 * way @react-pdf/renderer does, and it rejects woff2, which is the only format
 * next/font/google leaves on disk. @fontsource ships plain woff, which it
 * accepts. Read once and kept for the life of the process.
 */
let fontCache: [ArrayBuffer, ArrayBuffer] | null = null;

async function loadFonts(): Promise<[ArrayBuffer, ArrayBuffer]> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, "geist-sans-latin-400-normal.woff")),
    readFile(join(process.cwd(), FONT_DIR, "geist-sans-latin-700-normal.woff")),
  ]);
  fontCache = [
    regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer,
    bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer,
  ];
  return fontCache;
}

/**
 * Renders the certificate as a PNG for public display.
 *
 * This is the *public representation*, not the authoritative artifact. The
 * signed document is the PDF from `certificate-pdf.tsx`, which is encrypted
 * before being pinned to IPFS and is never served to anyone without a key —
 * so this deliberately renders a different, reduced document. Notably it takes
 * no `grade`: award classification exists only inside the encrypted artifact.
 * See docs/encrypted-certificates.md.
 *
 * A PNG rather than the PDF because the public page must not depend on an IPFS
 * gateway once the pinned file is ciphertext, and because an image works where
 * an embedded PDF does not: mobile browsers that force a download instead of
 * rendering inline, and og:image for the LinkedIn share on /c/[credentialId],
 * which cannot point at a PDF.
 *
 * Cosmetic divergence to be aware of: this is drawn by satori in Geist, while
 * the PDF is drawn by @react-pdf in Helvetica. Layout, wording and colour come
 * from the same `layout` and the same fields, but glyphs differ slightly. They
 * are already different documents by design, so this is a known trade-off
 * rather than a defect — the alternative is a second font pipeline for
 * @react-pdf, which only accepts TTF/OTF.
 */
export async function renderCertificateImage(params: CertificateImageParams): Promise<ImageResponse> {
  const { layout, recipientName, courseName, issuerName, credentialId, issuedAt, qrDataUrl } = params;
  const accentColor = layout.accentColor || "#4f46e5";
  const [regular, bold] = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 68,
          backgroundColor: "#ffffff",
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            border: `3px solid ${accentColor}`,
            padding: 56,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 54, fontWeight: 700, color: accentColor, textAlign: "center" }}>
              {layout.title || "Certificate of Completion"}
            </div>
            {layout.subtitle ? (
              <div style={{ fontSize: 24, color: "#555555", textAlign: "center" }}>{layout.subtitle}</div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 62, fontWeight: 700, textAlign: "center", marginBottom: 24 }}>
              {recipientName}
            </div>
            {layout.body ? (
              <div
                style={{
                  fontSize: 24,
                  lineHeight: 1.6,
                  color: "#333333",
                  textAlign: "center",
                  maxWidth: 820,
                }}
              >
                {layout.body}
              </div>
            ) : null}
            <div style={{ fontSize: 32, fontWeight: 700, textAlign: "center", marginTop: 16 }}>
              {courseName}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            {/* Each line is a single interpolated string, not text + expression:
                satori treats `Issued by {name}` as two child nodes and rejects
                any div with more than one child that lacks an explicit display. */}
            <div style={{ display: "flex", flexDirection: "column", fontSize: 18, color: "#666666" }}>
              <div>{`Issued by ${issuerName}`}</div>
              <div>
                {issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div>{`Credential ID: ${credentialId}`}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={qrDataUrl} width={128} height={128} />
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}
