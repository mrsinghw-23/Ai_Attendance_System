import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "AI_ATTENDANCE_SUPER_SECRET_2026";

export interface JwtPayload {
  id: number;
  username: string;
  role: string;
}

export function generateToken(
  payload: JwtPayload
) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "1d",
  });
}

export function verifyToken(
  token: string
) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}