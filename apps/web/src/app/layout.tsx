import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dirory",
  description: "Multi-vendor 3D product library for Indonesian construction products.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}