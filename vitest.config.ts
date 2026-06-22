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
        },
      },
    }),
  ],
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
});
