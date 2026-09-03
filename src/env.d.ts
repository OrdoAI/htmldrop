interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
  GIT_SHA?: string;
  GIT_REF?: string;
  BUILD_RUN?: string;
}

declare namespace Cloudflare {
  interface Env {
    BUCKET: R2Bucket;
    AUTH_SECRET: string;
    GIT_SHA?: string;
    GIT_REF?: string;
    BUILD_RUN?: string;
  }
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
