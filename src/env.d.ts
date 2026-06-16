interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
