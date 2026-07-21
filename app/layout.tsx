import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSV Borderò",
  description: "Estrai, verifica ed esporta il borderò delle spedizioni DSV.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
