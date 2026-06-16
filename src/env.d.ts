interface Env {
  PAGES: KVNamespace;
  AUTH_SECRET: string;
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
