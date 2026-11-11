export interface KeycloakTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

export interface KeycloakTokenClaims {
  sub: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  email?: string;
  exp: number;
  realm_access?: { roles: string[] };
}
