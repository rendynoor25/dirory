import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://dirory.com"),
  title: {
    default: "Dirory - Product Library for SketchUp",
    template: "%s | Dirory",
  },
  description:
    "Discover real Indonesian construction brands, 3D models and material textures for SketchUp. Free for architects and designers.",
  icons: { icon: "/dirory-mark.png", shortcut: "/dirory-mark.png" },
  openGraph: {
    title: "Dirory - Product Library for SketchUp",
    description:
      "Discover real Indonesian construction brands, 3D models and material textures for SketchUp.",
    siteName: "Dirory",
    type: "website",
    images: [{ url: "/dirory-mark.png", width: 693, height: 748, alt: "Dirory mark" }],
  },
  twitter: {
    card: "summary",
    title: "Dirory - Product Library for SketchUp",
    description: "Real Indonesian products for your SketchUp workflow.",
    images: ["/dirory-mark.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
