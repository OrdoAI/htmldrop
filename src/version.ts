import { withTransportSecurity } from "./security";

// GET /version: which commit is running, and which CI run deployed it. The
// deploy workflow passes these as `--var` so a deploy from anywhere else
// (a laptop `wrangler deploy`) shows up as `ci: false` with no commit. It is
// self-reported: it lets an honest deploy be audited against the public repo
// and makes a casual out-of-band deploy visible, it does not prove anything
// against an operator who forges the values.

const REPO = "https://github.com/OrdoAI/htmldrop";

interface VersionEnv {
  GIT_SHA?: string;
  GIT_REF?: string;
  BUILD_RUN?: string;
}

const HEADERS: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function versionInfo(env: VersionEnv) {
  const sha = env.GIT_SHA && /^[0-9a-f]{40}$/.test(env.GIT_SHA) ? env.GIT_SHA : null;
  const run = env.BUILD_RUN && /^[0-9]{1,20}$/.test(env.BUILD_RUN) ? env.BUILD_RUN : null;
  const ref = env.GIT_REF && /^[A-Za-z0-9._\/-]{1,128}$/.test(env.GIT_REF) ? env.GIT_REF : null;
  return {
    commit: sha,
    ref,
    source: sha ? `${REPO}/commit/${sha}` : null,
    deploy: run ? `${REPO}/actions/runs/${run}` : null,
    ci: sha !== null && run !== null,
    ...(sha && run ? {} : { note: "deployed without CI build metadata" }),
  };
}

export function handleVersionInfo(request: Request, env: VersionEnv): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: withTransportSecurity({ Allow: "GET, HEAD" }, request),
    });
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify(versionInfo(env)), {
    status: 200,
    headers: withTransportSecurity(HEADERS, request),
  });
}
