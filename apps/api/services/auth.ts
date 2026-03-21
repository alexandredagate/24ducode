import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import type {
  AuthTokens,
  JwtAccessPayload,
  JwtRefreshPayload
} from "types";

const accessSecret = process.env.ACCESS_SECRET || 'secret';
const refreshSecret = process.env.REFRESH_SECRET || 'secret';

const accessTtl = (process.env.ACCESS_TTL || '15m') as StringValue;
const refreshTtl = (process.env.REFRESH_TTL || '1d') as StringValue; // 24 heures, pas utile plus longtemps

export function issueTokens(codingGameId: string): AuthTokens {
  const accessToken = jwt.sign(
    { codingGameId, type: 'access' } satisfies JwtAccessPayload,
    accessSecret,
    { expiresIn: accessTtl  }
  )

  const refreshToken = jwt.sign(
    { codingGameId, type: 'refresh' } satisfies JwtRefreshPayload,
    refreshSecret,
    { expiresIn: refreshTtl  }
  )

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  const payload = jwt.verify(token, accessSecret) as JwtAccessPayload;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  const payload = jwt.verify(token, refreshSecret) as JwtRefreshPayload;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

export function refreshAccessToken(refreshToken: string): AuthTokens {
  const payload = verifyRefreshToken(refreshToken);
  return issueTokens(payload.codingGameId)
}
