import type { MetadataRoute } from "next";

// Cài lên màn hình chính điện thoại thì mở như một app riêng
// (không thanh địa chỉ trình duyệt), nền + thanh trạng thái màu giấy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diet Plan — Máy Tính Dinh Dưỡng",
    short_name: "Diet Plan",
    description:
      "Tính toán dinh dưỡng chuyên sâu và lên thực đơn cho khách hàng.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f2ea",
    theme_color: "#f6f2ea",
    lang: "vi",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
