import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "원찬 & 예은 — 둘만의 여행",
  description: "이원찬과 성예은, 둘만의 특별한 여행을 함께 계획하는 공간이에요…♪ 작고 귀여운 치이카와가 여행 메이트로 함께해요.",
  icons: {
    icon: "/munjackgui.webp",
    apple: "/munjackgui.webp",
  },
  openGraph: {
    title: "원찬 & 예은 — 둘만의 여행",
    description: "이원찬과 성예은, 둘만의 특별한 여행을 함께 계획하는 공간이에요…♪",
    images: [
      {
        url: "/munjackgui.webp",
        width: 512,
        height: 512,
        alt: "치이카와",
      },
      {
        url: "/munjackgui-thinking.png",
        width: 512,
        height: 512,
        alt: "치이카와 생각중",
      },
    ],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "원찬 & 예은 — 둘만의 여행",
    description: "둘만의 특별한 여행 플래너…♪",
    images: ["/munjackgui.webp", "/munjackgui-thinking.png"],
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
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
