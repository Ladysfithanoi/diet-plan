// Vai trò "Trải nghiệm": phiên dùng thử kéo dài 5 tiếng, tính từ lần ĐĂNG NHẬP
// ĐẦU TIÊN chứ không phải từ lúc Admin cấp tài khoản — khách chưa đăng nhập thì
// đồng hồ chưa chạy. Hết hạn thì không đăng nhập được nữa cho tới khi Admin kích
// hoạt lại hoặc chuyển sang vai trò USER.
//
// Quy ước dữ liệu: TRIAL + trialExpiresAt = null  →  chưa bắt đầu (chờ đăng nhập).

export const ROLE_TRIAL = "TRIAL";
export const ROLE_USER = "USER";
export const ROLE_ADMIN = "ADMIN";

export const TRIAL_DURATION_MS = 5 * 60 * 60 * 1000; // 5 tiếng

/** Mốc hết hạn cho một phiên trải nghiệm bắt đầu từ bây giờ. */
export function trialDeadlineFromNow(): Date {
  return new Date(Date.now() + TRIAL_DURATION_MS);
}

/** Tài khoản trải nghiệm đã được cấp nhưng chưa đăng nhập lần nào → đồng hồ chưa chạy. */
export function isTrialPending(role: string, trialExpiresAt: Date | string | null): boolean {
  return role === ROLE_TRIAL && !trialExpiresAt;
}

/** Tài khoản trải nghiệm đã hết hạn dùng thử hay chưa. */
export function isTrialExpired(role: string, trialExpiresAt: Date | string | null): boolean {
  if (role !== ROLE_TRIAL) return false;
  if (!trialExpiresAt) return false; // chưa bắt đầu → chưa hết hạn
  return new Date(trialExpiresAt).getTime() <= Date.now();
}
