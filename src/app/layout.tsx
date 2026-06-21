import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "The recursive citation economy on Arc: an AI agent pays for the sources it reads via x402 nanopayments and splits USDC back to the authors who grounded the answer. Cite Kuot and pay again — recursively.";

export const metadata: Metadata = {
  metadataBase: new URL("https://kuot-azure.vercel.app"),
  title: "Kuot — the recursive citation economy on Arc",
  description: DESCRIPTION,
  openGraph: {
    title: "Kuot — the recursive citation economy on Arc",
    description: DESCRIPTION,
    url: "https://kuot-azure.vercel.app",
    siteName: "Kuot",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kuot — citations that pay, on Arc",
    description: DESCRIPTION,
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
