import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wzrd.tech admin",
  description: "Operator dashboard for the air control plane",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
