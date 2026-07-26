import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import "./globals.css";

/**
 * One humanist sans carries the whole interface, the way Amazon Ember does on
 * Prime Video: big x-height, open apertures, readable at 12px in an overlay on
 * top of artwork. Hierarchy comes from weight and size, not from swapping
 * families mid-page.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Mono is now reserved for the agent's consultation rail — data, not prose. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cinema Brain",
  description: "Ask for a film. The catalog answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
