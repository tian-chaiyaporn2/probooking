import type { ReactNode } from "react";

export const metadata = {
  title: "ProBooking",
  description: "Verified. Available. Bookable. Payment Protected.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Launch language is Thai (LOC-01); lang set accordingly.
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
