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

/**
 * `template` suffixes the brand onto every child segment's title, so pages set
 * only their own half — "Search" becomes "Search - Kino". The default carries
 * the tagline because "Kino" alone is a crowded word; the home tab should say
 * what this one is.
 */
export const metadata: Metadata = {
  title: {
    default: "Kino - find your next film",
    template: "%s - Kino",
  },
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
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
