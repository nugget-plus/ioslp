import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Photo Maker",
  description: "Convert any video clip to an iOS Live Photo",
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#0d0d0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
