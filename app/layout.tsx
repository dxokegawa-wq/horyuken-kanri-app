import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "保留券・手入力管理",
  description: "レシート画像と処理内容、店長確認を管理する店舗台帳",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
