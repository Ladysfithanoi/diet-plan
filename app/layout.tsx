import type { Metadata } from "next";
import { Be_Vietnam_Pro, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Be Vietnam Pro — sans thiết kế riêng cho tiếng Việt, dùng cho UI + body
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Source Serif 4 — serif editorial cho headline, title, pull quote (có italic)
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  display: "swap",
});

// JetBrains Mono — mono cho số liệu (kcal, kg, %), code, metadata
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diet Plan - Máy Tính Dinh Dưỡng",
  description: "Tính toán dinh dưỡng chuyên sâu và lên thực đơn cho khách hàng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
