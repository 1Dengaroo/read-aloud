import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Hanken_Grotesk,
  Lexend,
  Newsreader,
} from "next/font/google";
import { FontScript } from "@/components/theme/FontScript";
import { ThemeProvider } from "@/components/theme/ThemeProvider.client";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-default",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-dyslexic",
  subsets: ["latin"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReadAloud",
  description: "Paste text, hear it spoken, follow along word by word.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hankenGrotesk.variable} ${newsreader.variable} ${lexend.variable} ${bricolageGrotesque.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <FontScript />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
