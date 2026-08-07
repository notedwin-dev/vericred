import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

export interface CertificateTemplateLayout {
  title?: string;
  subtitle?: string;
  body?: string;
  accentColor?: string;
}

export interface CertificatePdfProps {
  layout: CertificateTemplateLayout;
  recipientName: string;
  courseName: string;
  issuerName: string;
  credentialId: string;
  issuedAt: Date;
  qrDataUrl: string;
  /**
   * Award classification. Present only on the encrypted artifact — the public
   * PNG preview (lib/certificate-image.tsx) never receives it, and the public
   * verify API never returns it. See docs/encrypted-certificates.md.
   */
  grade?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  border: {
    flex: 1,
    borderWidth: 2,
    padding: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: "#555555",
    textAlign: "center",
  },
  recipientName: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginVertical: 16,
  },
  body: {
    fontSize: 12,
    lineHeight: 1.6,
    textAlign: "center",
    color: "#333333",
    maxWidth: 420,
  },
  courseName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 8,
  },
  grade: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    color: "#333333",
  },
  footer: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  footerText: {
    fontSize: 9,
    color: "#666666",
  },
  qr: {
    width: 64,
    height: 64,
  },
});

export function CertificatePdf({
  layout,
  recipientName,
  courseName,
  issuerName,
  credentialId,
  issuedAt,
  qrDataUrl,
  grade,
}: CertificatePdfProps) {
  const accentColor = layout.accentColor || "#4f46e5";

  return (
    <Document title={`Certificate - ${credentialId}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={[styles.border, { borderColor: accentColor }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: accentColor }]}>
              {layout.title || "Certificate of Completion"}
            </Text>
            {layout.subtitle && <Text style={styles.subtitle}>{layout.subtitle}</Text>}
          </View>

          <View style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Text style={styles.recipientName}>{recipientName}</Text>
            {layout.body && <Text style={styles.body}>{layout.body}</Text>}
            <Text style={styles.courseName}>{courseName}</Text>
            {grade && <Text style={styles.grade}>Grade: {grade}</Text>}
          </View>

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerText}>Issued by {issuerName}</Text>
              <Text style={styles.footerText}>
                {issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </Text>
              <Text style={styles.footerText}>Credential ID: {credentialId}</Text>
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={styles.qr} src={qrDataUrl} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
