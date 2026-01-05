import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PrinziFit",
  description: "Gestionale schede e nutrizione - controllo accessi manuale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
