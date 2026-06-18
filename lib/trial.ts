// Vai trò "Trải nghiệm": phiên dùng thử kéo dài 5 tiếng kể từ lúc được cấp /
// kích hoạt lại. Hết hạn thì không đăng nhập được nữa cho tới khi Admin kích
// hoạt lại hoặc chuyển sang vai trò USER.

export const ROLE_TRIAL = "TRIAL";
export const ROLE_USER = "USER";
export const ROLE_ADMIN = "ADMIN";

export const TRIAL_DURATION_MS = 5 * 60 * 60 * 1000; // 5 tiếng

/** Mốc hết hạn cho một phiên trải nghiệm bắt đầu từ bây giờ. */
export function trialDeadlineFromNow(): Date {
  return new Date(Date.now() + TRIAL_DURATION_MS);
}

/** Tài khoản trải nghiệm đã hết hạn dùng thử hay chưa. */
export function isTrialExpired(role: string, trialExpiresAt: Date | string | null): boolean {
  if (role !== ROLE_TRIAL) return false;
  if (!trialExpiresAt) return true; // TRIAL mà không có hạn → coi như hết hạn
  return new Date(trialExpiresAt).getTime() <= Date.now();
}
