import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

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
  title: "치이카와 — 원찬 & 예은",
  description: "작고 귀여운 치이카와가 둘만의 여행을 도와드려요…! 이원찬 & 성예은의 특별한 여행 플래너.",
  icons: {
    icon: "/munjackgui.webp",
    apple: "/munjackgui.webp",
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
    <body className="h-full flex flex-col overflow-hidden">{children}</body>
  </html>
);

export default RootLayout;
