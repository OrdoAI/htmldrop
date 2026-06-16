import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          kvNamespaces: ["PAGES"],
          bindings: {
            AUTH_SECRET: "test-secret-for-hmac-signing",
          },
        },
      },
    },
  },
});
