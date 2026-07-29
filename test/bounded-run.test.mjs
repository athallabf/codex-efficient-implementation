import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  boundedPreview,
  compressDuplicateLines,
  gitStateFingerprint,
  parseCliArguments,
  runBounded,
  validateRequest,
} from "../efficient-implementation/scripts/bounded-run.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function makeRepository() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "bounded-run-"));
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.name", "Test User"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  await writeFile(path.join(cwd, "tracked.txt"), "initial\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-qm", "initial"]);
  return cwd;
}

test("compressDuplicateLines collapses adjacent duplicates", () => {
  assert.equal(
    compressDuplicateLines("same\nsame\nsame\nother"),
    "same\n[... repeated previous line 2 more times ...]\nother",
  );
});

test("boundedPreview stays within the requested byte budget", () => {
  const result = boundedPreview(Buffer.from("a".repeat(10_000)), 512, "failure");
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text) <= 512);
  assert.ok(result.omittedBytes > 0);
});

test("parseCliArguments parses command mode and options", () => {
  assert.deepEqual(
    parseCliArguments(["--timeout-ms", "250", "--", "node", "-e", "process.exit(0)"]),
    {
      request: {
        program: "node",
        args: ["-e", "process.exit(0)"],
        timeoutMs: 250,
      },
    },
  );
});

test("validateRequest rejects invalid fields early", () => {
  assert.throws(() => validateRequest({ program: "", args: [] }), /program/);
  assert.throws(() => validateRequest({ program: "node", args: [], artifactRoot: 1 }), /artifactRoot/);
});

test("gitStateFingerprint can exclude generated artifact paths", async () => {
  const cwd = await makeRepository();
  const artifactRoot = path.join(cwd, ".codex-efficiency", "artifacts");
  const before = await gitStateFingerprint(cwd, [artifactRoot]);
  await writeFile(path.join(cwd, "untracked.txt"), "user change\n");
  const withUserChange = await gitStateFingerprint(cwd, [artifactRoot]);
  assert.notEqual(withUserChange, before);

  const { mkdir } = await import("node:fs/promises");
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, "generated.log"), "generated\n");
  const afterArtifact = await gitStateFingerprint(cwd, [artifactRoot]);
  assert.equal(afterArtifact, withUserChange);
});

test("runBounded detects an identical rerun without artifact feedback", async () => {
  const cwd = await makeRepository();
  const request = {
    cwd,
    program: process.execPath,
    args: ["-e", "process.stdout.write('ok\\n')"],
  };

  const first = await runBounded(request);
  const second = await runBounded(request);

  assert.equal(first.repeated, false);
  assert.equal(second.repeated, true);
  assert.equal(second.priorRun.runId, first.runId);
  assert.equal(second.stateFingerprint, first.stateFingerprint);
  assert.equal(second.runKey, first.runKey);
});

test("runBounded keeps previews bounded while preserving full output", async () => {
  const cwd = await makeRepository();
  const result = await runBounded({
    cwd,
    program: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(2 * 1024 * 1024))"],
    successPreviewBytes: 1024,
    hardOutputBytes: 2048,
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.stdoutBytes, 2 * 1024 * 1024);
  assert.ok(result.returnedBytes <= 1024);
  assert.equal(result.truncated, true);

  const stdoutPath = path.join(cwd, result.artifactDirectory, "stdout.log");
  assert.equal((await stat(stdoutPath)).size, result.stdoutBytes);
});

test("concurrent runs keep independent repetition records", async () => {
  const cwd = await makeRepository();
  const base = { cwd, program: process.execPath };
  await Promise.all([
    runBounded({ ...base, args: ["-e", "process.stdout.write('one')"] }),
    runBounded({ ...base, args: ["-e", "process.stdout.write('two')"] }),
  ]);

  const records = await readdir(path.join(cwd, ".codex-efficiency", "artifacts", "runs-by-key"));
  assert.equal(records.filter((name) => name.endsWith(".json")).length, 2);
  for (const record of records) {
    const parsed = JSON.parse(await readFile(path.join(cwd, ".codex-efficiency", "artifacts", "runs-by-key", record), "utf8"));
    assert.equal(typeof parsed.runId, "string");
  }
});

test("runBounded terminates commands that exceed the timeout", async () => {
  const cwd = await makeRepository();
  const result = await runBounded({
    cwd,
    program: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10_000)"],
    timeoutMs: 100,
    killGraceMs: 50,
  });

  assert.equal(result.status, "timed_out");
  assert.equal(result.timedOut, true);
});

test("runBounded refuses to store artifacts directly in the working directory", async () => {
  const cwd = await makeRepository();
  await assert.rejects(
    runBounded({
      cwd,
      artifactRoot: ".",
      program: process.execPath,
      args: ["-e", "process.exit(0)"],
    }),
    /artifactRoot must not be the working directory/,
  );
});
