import { randomInt } from "node:crypto";

// Bộ ký tự dễ đọc / dễ đọc qua điện thoại: bỏ các ký tự dễ nhầm (0 O o, 1 l I).
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Sinh mật khẩu ngẫu nhiên cho tài khoản mới. Admin không phải tự nghĩ mật khẩu —
 * mật khẩu được gửi kèm email chào mừng và hiện lại một lần trên màn hình Admin.
 */
export function generatePassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
