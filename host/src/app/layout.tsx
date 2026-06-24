import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { SITE_URL } from "@/lib/constants";
import { hostAsset } from "@/lib/assets";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const title = "Host a Dolce Sicilia tiramisù fridge — earn 20% of every sale";
const description =
  "Install a premium Sicilian tiramisù smart fridge in your building at zero cost. Earn 20% of every sale, paid monthly. Perfect for condos, offices, hotels and gyms in Singapore.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/host/",
  },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: "Dolce Sicilia",
    locale: "en_SG",
    type: "website",
    images: [
      {
        url: hostAsset("/og-host.jpg"),
        width: 1200,
        height: 630,
        alt: "Host a Dolce Sicilia tiramisù fridge and earn 20% of every sale",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [hostAsset("/og-host.jpg")],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-SG" className={`${cormorant.variable} ${inter.variable} scroll-smooth`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
