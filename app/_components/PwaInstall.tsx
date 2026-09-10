"use client";

import { useCallback, useEffect, useState } from "react";

// Sự kiện Chrome/Edge bắn ra khi web đủ điều kiện cài — chưa có trong lib DOM của TS.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "dp-install-dismissed-at";
const ASK_AGAIN_AFTER = 14 * 24 * 60 * 60 * 1000; // bấm "Để sau" thì 14 ngày sau mới hỏi lại

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < ASK_AGAIN_AFTER;
  } catch {
    return false;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari không hỗ trợ display-mode, dùng cờ riêng của WebKit
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Hỏi người dùng có muốn cài web thành app riêng trên điện thoại không.
 * - Chrome/Edge/Android: dùng đúng hộp thoại cài đặt của trình duyệt.
 * - iPhone/iPad: Safari không cho gọi hộp thoại → hướng dẫn Chia sẻ ▸ Thêm vào MH chính.
 * Đồng thời đăng ký service worker (điều kiện để trình duyệt coi đây là app cài được).
 */
export default function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      // Chặn banner mặc định để tự hỏi bằng giao diện của app
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS không bắn beforeinstallprompt → tự hiện lời mời kèm hướng dẫn
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const iosTimer = isIos && isSafari ? window.setTimeout(() => setVisible(true), 1200) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
    setShowIosGuide(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      // iOS: chỉ có thể hướng dẫn thủ công
      setShowIosGuide(true);
      return;
    }
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "dismissed") {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
    }
    setVisible(false);
  }, [deferred]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        className="w-full max-w-sm rounded-2xl p-4 shadow-2xl"
        style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: "#14110E" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={26} height={26} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold" style={{ color: "#14110E" }}>
              Cài Diet Plan vào điện thoại?
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "rgba(20,17,14,0.55)" }}>
              Mở thẳng như một app riêng, có icon ngoài màn hình chính, không cần gõ địa chỉ web.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng"
            className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg"
            style={{ color: "rgba(20,17,14,0.4)", background: "rgba(20,17,14,0.05)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {showIosGuide && (
          <div
            className="mt-3 rounded-xl px-4 py-3 text-xs leading-relaxed"
            style={{
              background: "rgba(181,101,30,0.04)",
              border: "1px solid rgba(181,101,30,0.12)",
              color: "rgba(20,17,14,0.65)",
            }}
          >
            Trên iPhone/iPad: bấm nút <strong>Chia sẻ</strong>{" "}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B5651E" strokeWidth="2" className="inline-block align-[-1px]">
              <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" strokeLinecap="round" />
            </svg>{" "}
            ở thanh dưới trình duyệt, kéo xuống chọn{" "}
            <strong>Thêm vào MH chính</strong> (Add to Home Screen), rồi bấm{" "}
            <strong>Thêm</strong>.
          </div>
        )}

        <div className="flex gap-3 mt-3">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ border: "1px solid rgba(20,17,14,0.12)", color: "rgba(20,17,14,0.6)", background: "transparent" }}
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={showIosGuide ? dismiss : install}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
            style={{ background: "#14110E", color: "#F6F2EA" }}
          >
            {showIosGuide ? "Đã hiểu" : "Cài đặt"}
          </button>
        </div>
      </div>
    </div>
  );
}
