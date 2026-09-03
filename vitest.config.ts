import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        r2Buckets: ["BUCKET"],
        bindings: {
          AUTH_SECRET: "test-secret-for-hmac-signing",
          GIT_SHA: "0123456789abcdef0123456789abcdef01234567",
          GIT_REF: "main",
          BUILD_RUN: "424242",
        },
      },
    }),
  ],
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
});
