import type { ReactNode } from "react";
import type { Viewport } from "next";
import { ToastProvider } from "../components/Toast";
import { th } from "../lib/strings";
import "./globals.css";

export const metadata = {
  title: th.brand,
  description: th.home.metadataDescription,
};

// Responsive: opt every page into device-width scaling (no forced desktop layout on mobile).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Launch language is Thai (LOC-01); lang set accordingly.
  return (
    <html lang="th">
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
