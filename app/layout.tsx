import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ЧЕМПІОН — робочий простір",
  description: "Приватний робочий вебдодаток футбольної школи ЧЕМПІОН",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/champion-club-emblem.jpg",
    apple: "/champion-club-emblem.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
