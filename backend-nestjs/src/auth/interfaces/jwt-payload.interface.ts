export interface JwtPayload {
  sub: string;
  email?: string;
}
export interface JwtSignOptions {
  expiresIn?: string | number;
  secret?: string;
}