const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,100}$/;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 100) {
    return "Password must be at most 100 characters";
  }
  if (!STRONG_PASSWORD.test(password)) {
    return "Password must include uppercase, lowercase, number, and special character";
  }
  return null;
}

export function generateTemporaryPassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const pick = (chars: string) =>
    chars[Math.floor(Math.random() * chars.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: length - required.length }, () =>
    pick(all)
  );

  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join("");
}
