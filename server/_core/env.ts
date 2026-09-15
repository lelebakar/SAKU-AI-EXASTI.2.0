export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.SAKU_JWT_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
};

export const MIN_JWT_SECRET_LENGTH = 32;

export function assertJwtSecret(secret = process.env.SAKU_JWT_SECRET ?? process.env.JWT_SECRET ?? "") {
  if (!secret.trim()) throw new Error("JWT_SECRET is required for signing session tokens");
  if (secret.length < MIN_JWT_SECRET_LENGTH) throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  return secret;
}
