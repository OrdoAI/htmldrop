import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const cliPath = new URL("../index.mjs", import.meta.url);
const fixtures = new URL("./fixtures/", import.meta.url);

function fixturePath(name) {
  return new URL(name, fixtures);
}

function withServer(handler) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        requests.push({ url: req.url, body });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ url: "http://preview.test/abc?p=secret", id: "abc", expiresAt: "2026-06-30T00:00:00.000Z" }));
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const port = server.address().port;
        const result = await handler(`http://127.0.0.1:${port}`, requests);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function runCli(args, endpoint, cwd = root.pathname, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath.pathname, ...args], {
      cwd,
      env: { ...process.env, HTMLDROP_URL: endpoint, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

function makePage(dir, imageName = "sample-synthetic.png") {
  copyFileSync(fixturePath(imageName), join(dir, basename(imageName)));
  const pagePath = join(dir, "page.html");
  writeFileSync(pagePath, `<!doctype html><img src="${imageName}">`);
  return pagePath;
}

function extractDataUri(html) {
  const match = html.match(/src="(data:[^"]+)"/);
  assert.ok(match, "expected an inlined data URI");
  return match[1];
}

test("npm CLI compresses local PNG assets before Base64 inlining", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-e2e-"));
  try {
    const pagePath = makePage(dir);
    await withServer(async (endpoint, requests) => {
      const result = await runCli([pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      const dataUri = extractDataUri(payload.html);
      assert.ok(dataUri.startsWith("data:image/webp;base64,"));
      const base64 = dataUri.split(",", 2)[1];
      assert.ok(base64.length <= 800000, `expected <= 800000 chars, got ${base64.length}`);
      assert.ok(base64.length < Math.ceil(readFileSync(fixturePath("sample-synthetic.png")).length / 3) * 4);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--no-inline leaves local references untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-no-inline-"));
  try {
    const pagePath = makePage(dir);
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["--no-inline", pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      assert.ok(payload.html.includes('src="sample-synthetic.png"'));
      assert.ok(!payload.html.includes("data:image/"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update <url> <file> parses id and password from the link and sends them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-update-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["update", "http://preview.test/myid?p=mypass", pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      assert.equal(payload.id, "myid");
      assert.equal(payload.password, "mypass");
      assert.ok(result.stdout.includes("http://preview.test/abc?p=secret"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update with a malformed or incomplete link fails locally without uploading", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-update-bad-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const bad = await runCli(["update", "not-a-valid-url", pagePath], endpoint);
      assert.notEqual(bad.code, 0);
      const noPassword = await runCli(["update", "http://preview.test/myid", pagePath], endpoint);
      assert.notEqual(noPassword.code, 0);
      assert.equal(requests.length, 0, "no upload should be attempted for a bad update URL");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--version prints the package version and does not upload", async () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const result = await runCli(["--version"], "http://127.0.0.1:1");
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(pkg.version), `expected version ${pkg.version} in stdout: ${result.stdout}`);
});

test("removed/unknown flags (-e, --endpoint, --update, --bogus) fail before upload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-unknown-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      for (const args of [
        ["--bogus", pagePath],
        ["-e", endpoint, pagePath],
        ["--endpoint", endpoint, pagePath],
        ["--update", "http://preview.test/x?p=y", pagePath],
        ["--update=http://preview.test/x?p=y", pagePath],
      ]) {
        const r = await runCli(args, endpoint);
        assert.notEqual(r.code, 0, `expected failure for: ${args.join(" ")}`);
      }
      assert.equal(requests.length, 0, "no upload should be attempted for unknown options");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create <file> explicit verb uploads without update credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-create-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["create", pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      assert.equal(payload.id, undefined);
      assert.equal(payload.password, undefined);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("-- lets a filename beginning with - through", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-dash-"));
  try {
    writeFileSync(join(dir, "-dash.html"), "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const ok = await runCli(["--", "-dash.html"], endpoint, dir);
      assert.equal(ok.code, 0, ok.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("more than one input file fails before upload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-two-"));
  try {
    const a = join(dir, "a.html");
    const b = join(dir, "b.html");
    writeFileSync(a, "<!doctype html><h1>a</h1>");
    writeFileSync(b, "<!doctype html><h1>b</h1>");
    await withServer(async (endpoint, requests) => {
      const r = await runCli([a, b], endpoint);
      assert.notEqual(r.code, 0);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create with no file and update with wrong operand counts fail before upload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-arity-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const cases = [
        ["create"],                                                 // create, no file
        ["update", "http://preview.test/id?p=pw"],                  // update, missing file
        ["update", "http://preview.test/id?p=pw", pagePath, "x"],   // update, extra operand
      ];
      for (const args of cases) {
        const r = await runCli(args, endpoint);
        assert.notEqual(r.code, 0, `expected failure for: ${args.join(" ")}`);
      }
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--no-inline works before and after the update verb", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-perm-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      for (const args of [
        ["update", "http://preview.test/permid?p=permpw", pagePath, "--no-inline"],
        ["--no-inline", "update", "http://preview.test/permid?p=permpw", pagePath],
      ]) {
        const r = await runCli(args, endpoint);
        assert.equal(r.code, 0, r.stderr);
      }
      assert.equal(requests.length, 2);
      for (const req of requests) {
        const payload = JSON.parse(req.body);
        assert.equal(payload.id, "permid");
        assert.equal(payload.password, "permpw");
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file literally named update is reachable via explicit create", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-reserved-"));
  try {
    writeFileSync(join(dir, "update"), "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const r = await runCli(["create", "update"], endpoint, dir);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- skill freshness check (HTMLDROP_EXPECTED_TREE = baked tree sha,
//     HTMLDROP_SKILL_LOCK = path to a .skill-lock.json; both dev/test seams) ---

function writeLock(dir, entry) {
  const lockPath = join(dir, ".skill-lock.json");
  writeFileSync(lockPath, JSON.stringify(entry));
  return lockPath;
}

test("a stale skill (lock tree sha != baked) hard-errors with the update hint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-stale-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, {
        HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
        HTMLDROP_SKILL_LOCK: lock,
      });
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /npx skills update htmldrop/);
      assert.equal(requests.length, 0, "a stale skill must not upload");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a current skill (lock tree sha == baked) uploads normally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-fresh-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const sha = "abc123abc123abc123abc123abc123abc123abc1";
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: sha } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, {
        HTMLDROP_EXPECTED_TREE: sha,
        HTMLDROP_SKILL_LOCK: lock,
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("freshness is skipped when htmldrop is absent from the lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-nolock-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const lock = writeLock(dir, { skills: { somethingelse: { skillFolderHash: "x" } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, {
        HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
        HTMLDROP_SKILL_LOCK: lock,
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("freshness is skipped when there is no baked tree (dev / direct users)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-nobaked-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    // a mismatching lock is present, but no HTMLDROP_EXPECTED_TREE and no
    // skill-tree.json in dev -> the check is a no-op, upload proceeds.
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, { HTMLDROP_SKILL_LOCK: lock });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed or missing lock files skip the check", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-badlock-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const malformed = join(dir, "bad.json");
    writeFileSync(malformed, "{ not json");
    const missing = join(dir, "nope.json");
    await withServer(async (endpoint, requests) => {
      for (const lock of [malformed, missing]) {
        const r = await runCli([pagePath], endpoint, root.pathname, {
          HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
          HTMLDROP_SKILL_LOCK: lock,
        });
        assert.equal(r.code, 0, `${lock} should skip: ${r.stderr}`);
      }
      assert.equal(requests.length, 2);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("divergent global locks are ambiguous and skip the check", async () => {
  const home = mkdtempSync(join(tmpdir(), "htmldrop-cli-home-"));
  try {
    const pagePath = join(home, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    mkdirSync(join(home, ".agents"), { recursive: true });
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    writeFileSync(join(home, ".agents/.skill-lock.json"), JSON.stringify({ skills: { htmldrop: { skillFolderHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } } }));
    writeFileSync(join(home, ".claude/skills/.skill-lock.json"), JSON.stringify({ skills: { htmldrop: { skillFolderHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } } }));
    await withServer(async (endpoint, requests) => {
      // cwd=home has no project lock; the two global locks disagree -> skip
      const r = await runCli([pagePath], endpoint, home, {
        HOME: home,
        HTMLDROP_EXPECTED_TREE: "cccccccccccccccccccccccccccccccccccccccc",
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--help and --version exit 0 and print 0.2.1 even when the skill is stale", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-helpver-"));
  try {
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } });
    const env = {
      HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
      HTMLDROP_SKILL_LOCK: lock,
    };
    const h = await runCli(["--help"], "http://127.0.0.1:1", root.pathname, env);
    assert.equal(h.code, 0, h.stderr);
    const v = await runCli(["--version"], "http://127.0.0.1:1", root.pathname, env);
    assert.equal(v.code, 0, v.stderr);
    assert.ok(v.stdout.includes("0.2.1"), `expected 0.2.1 in: ${v.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a confirmed stale skill is reported before a missing input file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-order-"));
  try {
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } });
    const r = await runCli([join(dir, "does-not-exist.html")], "http://127.0.0.1:1", root.pathname, {
      HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
      HTMLDROP_SKILL_LOCK: lock,
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /npx skills update htmldrop/);
    assert.doesNotMatch(r.stderr, /file not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a removed flag errors at parse time, before the freshness check runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-parsefirst-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const lock = writeLock(dir, { skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } });
    const r = await runCli(["--update", "http://x/y?p=z", pagePath], "http://127.0.0.1:1", root.pathname, {
      HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
      HTMLDROP_SKILL_LOCK: lock,
    });
    assert.notEqual(r.code, 0);
    assert.doesNotMatch(r.stderr, /npx skills update htmldrop/, "a parse error must precede the freshness check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale project skill (computedHash != baked) hard-errors with the update hint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-projstale-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const lock = writeLock(dir, { skills: { htmldrop: { computedHash: "0000000000000000000000000000000000000000000000000000000000000000" } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, {
        HTMLDROP_EXPECTED_COMPUTED: "1111111111111111111111111111111111111111111111111111111111111111",
        HTMLDROP_SKILL_LOCK: lock,
      });
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /npx skills update htmldrop/);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a current project skill (computedHash == baked) uploads normally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-projfresh-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    const ch = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef0";
    const lock = writeLock(dir, { skills: { htmldrop: { computedHash: ch } } });
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, root.pathname, {
        HTMLDROP_EXPECTED_COMPUTED: ch,
        HTMLDROP_SKILL_LOCK: lock,
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a project install takes priority over a fresh global one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-prio-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    // project lock in cwd: stale computedHash
    writeFileSync(join(dir, "skills-lock.json"), JSON.stringify({ skills: { htmldrop: { computedHash: "0000000000000000000000000000000000000000000000000000000000000000" } } }));
    // global lock under HOME: fresh skillFolderHash (should be ignored)
    mkdirSync(join(dir, ".agents"), { recursive: true });
    const freshGlobal = "fresh00000000000000000000000000000fresh0";
    writeFileSync(join(dir, ".agents/.skill-lock.json"), JSON.stringify({ skills: { htmldrop: { skillFolderHash: freshGlobal } } }));
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, dir, {
        HOME: dir,
        HTMLDROP_EXPECTED_TREE: freshGlobal, // global would be fresh
        HTMLDROP_EXPECTED_COMPUTED: "1111111111111111111111111111111111111111111111111111111111111111", // project lock differs -> stale
      });
      assert.notEqual(r.code, 0, "the stale project install must win over a fresh global");
      assert.match(r.stderr, /npx skills update htmldrop/);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a project entry without a comparable computedHash skips (no global fallback)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-projnocomp-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    // project entry present but no computedHash
    writeFileSync(join(dir, "skills-lock.json"), JSON.stringify({ skills: { htmldrop: { source: "OrdoAI/htmldrop" } } }));
    // global lock is stale -> would error if (wrongly) consulted
    mkdirSync(join(dir, ".agents"), { recursive: true });
    writeFileSync(join(dir, ".agents/.skill-lock.json"), JSON.stringify({ skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } }));
    await withServer(async (endpoint, requests) => {
      const r = await runCli([pagePath], endpoint, dir, {
        HOME: dir,
        HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
        HTMLDROP_EXPECTED_COMPUTED: "2222222222222222222222222222222222222222222222222222222222222222",
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a project entry whose baked computedHash is missing skips (no global fallback)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-projnobaked-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    writeFileSync(join(dir, "skills-lock.json"), JSON.stringify({ skills: { htmldrop: { computedHash: "abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcab00" } } }));
    mkdirSync(join(dir, ".agents"), { recursive: true });
    writeFileSync(join(dir, ".agents/.skill-lock.json"), JSON.stringify({ skills: { htmldrop: { skillFolderHash: "0000000000000000000000000000000000000000" } } }));
    await withServer(async (endpoint, requests) => {
      // global stale, but no baked computedHash for the project entry -> skip
      const r = await runCli([pagePath], endpoint, dir, {
        HOME: dir,
        HTMLDROP_EXPECTED_TREE: "1111111111111111111111111111111111111111",
      });
      assert.equal(r.code, 0, r.stderr);
      assert.equal(requests.length, 1);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
