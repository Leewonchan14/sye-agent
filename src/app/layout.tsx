import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL) ||
  "http://localhost:3000";
const SITE_URL = BASE_URL.startsWith("http") ? BASE_URL : `https://${BASE_URL}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  openGraph: {
    url: SITE_URL,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    type: "website",
    locale: "ko_KR",
  },
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => (
  <html
    lang="ko"
    className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
  >
    <body className="flex h-full flex-col overflow-hidden">
      <Providers>
        <TooltipProvider>{children}</TooltipProvider>
      </Providers>
    </body>
  </html>
);

export default RootLayout;
