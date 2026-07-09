import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = {
  title: "Đặt lại mật khẩu · Diet Plan",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F2EA" }} />
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
