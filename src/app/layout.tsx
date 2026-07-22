import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  title: "하치와레 메이트",
  description:
    "작고 귀여운 하치와레가 메이트로 도와줄게요♪",
  icons: {
    icon: [{ url: "/munjackgui.png", sizes: "384x384", type: "image/png" }],
    apple: { url: "/munjackgui.png", sizes: "384x384", type: "image/png" },
  },
  openGraph: {
    url: SITE_URL,
    title: "하치와레 메이트",
    description: "하치와레 메이트가 도와줄게요♪",
    images: [
      {
        url: "/munjackgui.png",
        width: 384,
        height: 384,
        alt: "하치와레",
      },
      {
        url: "/munjackgui-thinking.png",
        width: 200,
        height: 200,
        alt: "하치와레 생각중",
      },
    ],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "하치와레 메이트",
    description: "하치와레 메이트가 도와줄게요♪",
    images: ["/munjackgui.png"],
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
