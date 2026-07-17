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
});

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: th.brand,
  description: th.home.metadataDescription,
};

// Responsive: opt every page into device-width scaling (no forced desktop layout on mobile).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}`,
          }}
        />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
