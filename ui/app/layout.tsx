import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Marketing Engine",
  description: "Your AI marketing department, in a box.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
