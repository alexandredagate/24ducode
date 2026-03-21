export interface AuthLoginPayload {
  codingGameId: string;
}

export interface AuthTokens {
  accessToken: string;
}

export interface JwtAccessPayload {
  codingGameId: string;
  type: "access";
}
