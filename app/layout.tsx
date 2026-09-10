import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import PwaInstall from "./_components/PwaInstall";

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
  applicationName: "Diet Plan",
  // iPhone/iPad: mở toàn màn hình như app riêng khi thêm vào màn hình chính
  appleWebApp: {
    capable: true,
    title: "Diet Plan",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Khớp bề rộng máy, tràn ra vùng tai thỏ, tô thanh trạng thái theo màu giấy của app
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f2ea",
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
        <PwaInstall />
      </body>
    </html>
  );
}
