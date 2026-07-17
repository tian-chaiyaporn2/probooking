import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { SkipLink } from "../components/SkipLink";
import { ToastProvider } from "../components/Toast";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata = {
  title: "ProBooking",
  description: "Verified. Available. Bookable. Payment Protected.",
};

// Responsive: opt every page into device-width scaling (no forced desktop layout on mobile).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Launch language is Thai (LOC-01); lang set accordingly.
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className={notoSansThai.className}>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}`,
          }}
        />
        <SkipLink />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
