export interface AuthLoginPayload {
  codingGameId: string;
}

export interface AuthRefreshPayload {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtAccessPayload {
  codingGameId: string;
  type: "access";
}

export interface JwtRefreshPayload {
  codingGameId: string;
  type: "refresh";
}
