import type { Metadata } from "next";
import "./globals.css";
import { Space_Grotesk } from "next/font/google";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "City Barber Shops → CSV Export",
  description:
    "Find barber shops in any city using Google Maps Places API and export them to CSV."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={font.className}>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
