import type { ReactNode } from "react";
import type { Viewport } from "next";
import { ToastProvider } from "../components/Toast";
import "./globals.css";

export const metadata = {
  title: "ProBooking",
  description: "Verified. Available. Bookable. Payment Protected.",
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
