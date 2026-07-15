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
  process.env.VERCEL_URL ||
  "http://localhost:3000";
const SITE_URL = BASE_URL.startsWith("http")
  ? BASE_URL
  : `https://${BASE_URL}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "원찬 & 예은 — 둘만의 데이트",
  description:
    "이원찬과 성예은, 둘만의 특별한 데이트를 함께 계획하는 공간이에요…♪ 작고 귀여운 치이카와가 데이트 메이트로 함께해요.",
  icons: {
    icon: [{ url: "/munjackgui.webp", sizes: "384x384", type: "image/webp" }],
    apple: { url: "/munjackgui.webp", sizes: "384x384", type: "image/webp" },
  },
  openGraph: {
    url: SITE_URL,
    title: "원찬 & 예은 — 둘만의 데이트",
    description: "이원찬과 성예은, 둘만의 특별한 데이트를 함께 계획하는 공간이에요…♪",
    images: [
      {
        url: "/munjackgui.webp",
        width: 384,
        height: 384,
        alt: "치이카와",
      },
      {
        url: "/munjackgui-thinking.png",
        width: 200,
        height: 200,
        alt: "치이카와 생각중",
      },
    ],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "원찬 & 예은 — 둘만의 데이트",
    description: "둘만의 특별한 데이트 플래너…♪",
    images: ["/munjackgui.webp"],
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
    <body className="h-full flex flex-col overflow-hidden">
      <Providers>
        <TooltipProvider>{children}</TooltipProvider>
      </Providers>
    </body>
  </html>
);

export default RootLayout;
