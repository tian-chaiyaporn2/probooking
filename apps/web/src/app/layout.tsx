import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Anuphan, Sarabun } from "next/font/google";
import { ToastProvider } from "../components/Toast";
import { th } from "../lib/strings";
import "./globals.css";

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: true,
  preload: true,
});

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: true,
  preload: true,
});

export const metadata = {
  title: th.brand,
  description: th.home.metadataDescription,
};

// Responsive: opt every page into device-width scaling (no forced desktop layout on mobile).
// viewportFit: cover unlocks env(safe-area-inset-*) for notched phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4faf8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Launch language is Thai (LOC-01); lang set accordingly.
  return (
    <html lang="th" className={`${anuphan.variable} ${sarabun.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          {th.a11y.skipToContent}
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
