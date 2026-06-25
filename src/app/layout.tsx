import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "万年麻将",
  description: "四人麻将游戏",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
