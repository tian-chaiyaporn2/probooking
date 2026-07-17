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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Launch language is Thai (LOC-01); lang set accordingly.
  return (
    <html lang="th" className={`${anuphan.variable} ${sarabun.variable}`}>
      <body>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            // Resolve theme before paint so CSS only needs [data-theme], not duplicated media queries.
            __html: `try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:(d?'dark':'light');}catch(e){}`,
          }}
        />
        <a className="skip-link" href="#main">
          {th.a11y.skipToContent}
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
