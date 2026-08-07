import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/providers/session-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VeriCred - Academic Credential Verification",
  description: "Blockchain-based academic credential issuance and verification platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthSessionProvider>
            {/*
              Neither AppKitProvider nor Web3Provider is mounted here, on
              purpose. Anything imported by this layout lands in the
              compilation unit of *every* route, including the landing page and
              the public verification pages that never touch a wallet.

              AppKitProvider's module scope calls createAppKit(), pulling in the
              whole @reown/appkit graph (~51MB on disk, Lit web components with
              it); Web3Provider pulls ethers (~10MB). Together they took the
              landing page from ~1.1k modules to ~9.2k, and its first dev
              compile from ~8s to ~48s.

              Both are mounted per-route instead — see
              providers/appkit-provider.tsx and docs/prds/dev-performance.md.
            */}
            {children}
            <Toaster position="top-right" richColors closeButton />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
