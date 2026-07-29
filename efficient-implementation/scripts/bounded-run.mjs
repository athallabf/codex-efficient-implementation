#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SUCCESS_BUDGET = 2 * 1024;
const FAILURE_BUDGET = 8 * 1024;
const HARD_CAP = 12 * 1024;
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_GRACE = 750;
const HELP = `Usage:
  bounded-run.mjs -- [program] [args...]
  bounded-run.mjs [options] -- [program] [args...]
  bounded-run.mjs --json '{"program":"npm","args":["test"]}'
  bounded-run.mjs --input request.json
  printf '%s' '{"program":"npm","args":["test"]}' | bounded-run.mjs

Options before --:
  --cwd DIR  --timeout-ms N  --artifact-root DIR
  --success-preview-bytes N  --failure-preview-bytes N  --hard-output-bytes N
  --kill-grace-ms N  -h, --help

Commands run directly with shell:false. Full stdout/stderr are saved as artifacts.`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compressDuplicateLines(text) {
  const lines = text.split("\n");
  const output = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    let end = index + 1;
    while (end < lines.length && lines[end] === line) end += 1;
    output.push(line);
    const repeats = end - index - 1;
    if (repeats > 0) output.push(`[... repeated previous line ${repeats} more time${repeats === 1 ? "" : "s"} ...]`);
    index = end;
  }
  return output.join("\n");
}

function byteSlice(buffer, start, end) {
  return buffer.subarray(Math.max(0, start), Math.min(buffer.length, end));
}

export function boundedPreview(buffer, budget, mode = "failure") {
  if (budget <= 0) return { text: "", truncated: buffer.length > 0, omittedBytes: buffer.length };
  const original = buffer.toString("utf8");
  const compressed = compressDuplicateLines(original);
  const compressionRemovedBytes = Math.max(0, buffer.length - Buffer.byteLength(compressed));
  const compact = compressionRemovedBytes > 0 ? compressed : original;
  if (Buffer.byteLength(compact) <= budget) {
    return { text: compact, truncated: compressionRemovedBytes > 0, omittedBytes: compressionRemovedBytes };
  }

  let contentBudget = Math.max(0, budget - 128);
  let text = "";
  let omitted = buffer.length;
  while (contentBudget >= 0) {
    const headBudget = mode === "failure" ? Math.floor(contentBudget * 0.3) : Math.floor(contentBudget * 0.15);
    const tailBudget = contentBudget - headBudget;
    omitted = buffer.length - headBudget - tailBudget;
    const marker = `\n[... ${omitted} bytes omitted; full output preserved in artifact ...]\n`;
    const candidate = byteSlice(buffer, 0, headBudget).toString("utf8") + marker
      + byteSlice(buffer, buffer.length - tailBudget, buffer.length).toString("utf8");
    const candidateCompressed = compressDuplicateLines(candidate);
    text = Buffer.byteLength(candidateCompressed) < Buffer.byteLength(candidate) ? candidateCompressed : candidate;
    const overflow = Buffer.byteLength(text) - budget;
    if (overflow <= 0) break;
    contentBudget -= overflow;
  }
  return { text, truncated: true, omittedBytes: Math.max(0, omitted) };
}

class BoundedCapture {
  constructor(retainBytes) {
    this.retainBytes = retainBytes;
    this.headChunks = [];
    this.headBytes = 0;
    this.tail = Buffer.alloc(0);
    this.bytes = 0;
    this.newlines = 0;
  }

  add(chunk) {
    const value = Buffer.from(chunk);
    this.bytes += value.length;
    for (const byte of value) {
      if (byte === 10) this.newlines += 1;
    }

    if (this.headBytes < this.retainBytes) {
      const remaining = this.retainBytes - this.headBytes;
      const selected = value.subarray(0, remaining);
      if (selected.length > 0) {
        this.headChunks.push(Buffer.from(selected));
        this.headBytes += selected.length;
      }
    }

    if (value.length >= this.retainBytes) {
      this.tail = Buffer.from(value.subarray(value.length - this.retainBytes));
    } else {
      const combined = this.tail.length === 0 ? value : Buffer.concat([this.tail, value]);
      this.tail = combined.length > this.retainBytes
        ? Buffer.from(combined.subarray(combined.length - this.retainBytes))
        : Buffer.from(combined);
    }
  }

  get head() {
    return Buffer.concat(this.headChunks, this.headBytes);
  }

  get lines() {
    return this.bytes === 0 ? 0 : this.newlines + 1;
  }
}

function previewCapture(capture, budget, mode) {
  const head = capture.head;
  if (capture.bytes <= head.length) return boundedPreview(head, budget, mode);
  if (budget <= 0) return { text: "", truncated: capture.bytes > 0, omittedBytes: capture.bytes };

  let contentBudget = Math.max(0, budget - 128);
  let text = "";
  let omitted = capture.bytes;
  while (contentBudget >= 0) {
    const headBudget = mode === "failure" ? Math.floor(contentBudget * 0.3) : Math.floor(contentBudget * 0.15);
    const tailBudget = contentBudget - headBudget;
    omitted = capture.bytes - headBudget - tailBudget;
    const marker = `\n[... ${omitted} bytes omitted; full output preserved in artifact ...]\n`;
    const candidate = byteSlice(head, 0, headBudget).toString("utf8") + marker
      + byteSlice(capture.tail, capture.tail.length - tailBudget, capture.tail.length).toString("utf8");
    const candidateCompressed = compressDuplicateLines(candidate);
    text = Buffer.byteLength(candidateCompressed) < Buffer.byteLength(candidate) ? candidateCompressed : candidate;
    const overflow = Buffer.byteLength(text) - budget;
    if (overflow <= 0) break;
    contentBudget -= overflow;
  }
  return { text, truncated: true, omittedBytes: Math.max(0, omitted) };
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function exclusionPathspecs(repoRoot, excludedPaths) {
  return excludedPaths
    .map((excluded) => path.resolve(excluded))
    .filter((excluded) => isWithin(repoRoot, excluded) && excluded !== repoRoot)
    .map((excluded) => path.relative(repoRoot, excluded).split(path.sep).join("/"))
    .map((relative) => `:(exclude)${relative}`);
}

async function listUntracked(repoRoot, pathspecs) {
  const result = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...pathspecs], {
    cwd: repoRoot, encoding: "buffer", shell: false,
  });
  if (result.status !== 0) return [];
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

export async function gitStateFingerprint(cwd, excludedPaths = []) {
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", shell: false });
  if (root.status !== 0) return sha256(`non-git:${await realpath(cwd)}`);
  const repoRoot = root.stdout.trim();
  const pathspecs = exclusionPathspecs(repoRoot, excludedPaths);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", shell: false });
  const diff = spawnSync("git", ["diff", "--binary", "HEAD", "--", ".", ...pathspecs], {
    cwd: repoRoot, encoding: "buffer", shell: false,
  });
  const staged = spawnSync("git", ["diff", "--binary", "--cached", "--", ".", ...pathspecs], {
    cwd: repoRoot, encoding: "buffer", shell: false,
  });
  const hash = createHash("sha256");
  hash.update(head.status === 0 ? head.stdout.trim() : "no-head");
  hash.update(diff.stdout ?? Buffer.alloc(0));
  hash.update(staged.stdout ?? Buffer.alloc(0));
  for (const relative of await listUntracked(repoRoot, pathspecs)) {
    const absolute = path.resolve(repoRoot, relative);
    hash.update(relative);
    try {
      const info = await stat(absolute);
      if (info.isFile()) hash.update(await readFile(absolute));
    } catch {
      hash.update("unreadable");
    }
  }
  return hash.digest("hex");
}

export async function computeRunKey(request, canonicalCwd, fingerprint) {
  return sha256(stableJson({
    cwd: canonicalCwd,
    program: request.program,
    args: request.args,
    env: request.env ?? {},
    fingerprint,
  }));
}

export function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("request must be a JSON object");
  if (typeof request.program !== "string" || request.program.length === 0) throw new Error("program must be a non-empty string");
  if (!Array.isArray(request.args) || request.args.some((arg) => typeof arg !== "string")) throw new Error("args must be an array of strings");
  if (request.cwd !== undefined && typeof request.cwd !== "string") throw new Error("cwd must be a string");
  if (request.artifactRoot !== undefined && typeof request.artifactRoot !== "string") throw new Error("artifactRoot must be a string");
  for (const key of ["timeoutMs", "successPreviewBytes", "failurePreviewBytes", "hardOutputBytes", "killGraceMs"]) {
    if (request[key] !== undefined && (!Number.isInteger(request[key]) || request[key] <= 0)) throw new Error(`${key} must be a positive integer`);
  }
  if (request.hardOutputBytes !== undefined && request.hardOutputBytes < 1024) throw new Error("hardOutputBytes must be at least 1024");
  if (request.env !== undefined && (!request.env || typeof request.env !== "object" || Array.isArray(request.env)
      || Object.values(request.env).some((value) => typeof value !== "string"))) {
    throw new Error("env must be an object containing string values");
  }
  return request;
}

async function readJson(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, filePath);
}

function terminateTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* already exited */ }
  }
}

export async function runBounded(rawRequest, options = {}) {
  const request = validateRequest(rawRequest);
  const cwdInput = path.resolve(options.baseCwd ?? process.cwd(), request.cwd ?? ".");
  let cwd;
  try {
    cwd = await realpath(cwdInput);
    if (!(await stat(cwd)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`invalid working directory: ${cwdInput}`);
  }

  const artifactRoot = path.resolve(cwd, request.artifactRoot ?? ".codex-efficiency/artifacts");
  if (artifactRoot === cwd) throw new Error("artifactRoot must not be the working directory");

  const fingerprint = await gitStateFingerprint(cwd, [artifactRoot]);
  const runKey = await computeRunKey(request, cwd, fingerprint);
  const historyPath = path.join(artifactRoot, "runs-by-key", `${runKey}.json`);
  const priorRun = await readJson(historyPath);

  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${randomBytes(4).toString("hex")}`;
  const artifactDirectory = path.join(artifactRoot, runId);
  await mkdir(artifactDirectory, { recursive: true });
  const stdoutPath = path.join(artifactDirectory, "stdout.log");
  const stderrPath = path.join(artifactDirectory, "stderr.log");
  const stdoutFile = createWriteStream(stdoutPath, { flags: "wx" });
  const stderrFile = createWriteStream(stderrPath, { flags: "wx" });
  const hardCap = request.hardOutputBytes ?? HARD_CAP;
  const stdoutCapture = new BoundedCapture(hardCap);
  const stderrCapture = new BoundedCapture(hardCap);
  const stdoutHasher = createHash("sha256");
  const stderrHasher = createHash("sha256");
  const started = Date.now();
  let timedOut = false;
  let forced = false;

  const child = spawn(request.program, request.args, {
    cwd,
    env: { ...process.env, ...(request.env ?? {}) },
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const value = Buffer.from(chunk);
    stdoutCapture.add(value);
    stdoutHasher.update(value);
    stdoutFile.write(value);
  });
  child.stderr.on("data", (chunk) => {
    const value = Buffer.from(chunk);
    stderrCapture.add(value);
    stderrHasher.update(value);
    stderrFile.write(value);
  });

  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT;
  const killGraceMs = request.killGraceMs ?? DEFAULT_GRACE;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateTree(child, "SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        forced = true;
        terminateTree(child, "SIGKILL");
      }
    }, killGraceMs).unref();
  }, timeoutMs);

  const [exitCode, signal] = await once(child, "exit");
  clearTimeout(timer);
  const stdoutFinished = finished(stdoutFile);
  const stderrFinished = finished(stderrFile);
  stdoutFile.end();
  stderrFile.end();
  await Promise.all([stdoutFinished, stderrFinished]);

  const failed = timedOut || exitCode !== 0;
  const requestedBudget = failed ? (request.failurePreviewBytes ?? FAILURE_BUDGET) : (request.successPreviewBytes ?? SUCCESS_BUDGET);
  const totalBudget = Math.min(requestedBudget, hardCap);
  let stderrBudget = stderrCapture.bytes === 0 ? 0 : failed ? Math.floor(totalBudget * 0.65) : Math.min(1024, Math.floor(totalBudget * 0.25));
  let stdoutBudget = stdoutCapture.bytes === 0 ? 0 : totalBudget - stderrBudget;
  if (stdoutCapture.bytes === 0) stderrBudget = totalBudget;
  if (stderrCapture.bytes === 0) stdoutBudget = totalBudget;
  const stdoutPreview = previewCapture(stdoutCapture, stdoutBudget, failed ? "failure" : "success");
  const stderrPreview = previewCapture(stderrCapture, stderrBudget, "failure");
  const returnedBytes = Buffer.byteLength(stdoutPreview.text) + Buffer.byteLength(stderrPreview.text);
  const truncated = stdoutPreview.truncated || stderrPreview.truncated;
  const status = timedOut ? "timed_out" : exitCode === 0 ? "succeeded" : "failed";
  const summary = {
    runId,
    program: request.program,
    args: request.args,
    status,
    exitCode: typeof exitCode === "number" ? exitCode : null,
    signal: signal ?? null,
    durationMs: Date.now() - started,
    stdoutPreview: stdoutPreview.text,
    stderrPreview: stderrPreview.text,
    stdoutBytes: stdoutCapture.bytes,
    stderrBytes: stderrCapture.bytes,
    stdoutLines: stdoutCapture.lines,
    stderrLines: stderrCapture.lines,
    returnedBytes,
    omittedBytes: stdoutPreview.omittedBytes + stderrPreview.omittedBytes,
    truncated,
    timedOut,
    forcedTermination: forced,
    artifactDirectory: path.relative(cwd, artifactDirectory) || ".",
    contentHash: sha256(`stdout\0${stdoutHasher.digest("hex")}\0stderr\0${stderrHasher.digest("hex")}`),
    stateFingerprint: fingerprint,
    runKey,
    repeated: Boolean(priorRun),
    priorRun: priorRun ? { runId: priorRun.runId, status: priorRun.status } : null,
    repetitionWarning: priorRun ? "Identical command previously ran against the same repository state; execution was not skipped." : null,
  };
  await atomicWriteJson(path.join(artifactDirectory, "metadata.json"), summary);
  await atomicWriteJson(historyPath, { runId, status, completedAt: new Date().toISOString() });
  return summary;
}

function positiveInteger(value, option) {
  if (!/^\d+$/.test(value ?? "") || Number(value) <= 0) throw new Error(`${option} requires a positive integer`);
  return Number(value);
}

export function parseCliArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const inputIndex = argv.indexOf("--input");
  const jsonIndex = argv.indexOf("--json");
  const separatorIndex = argv.indexOf("--");
  const modes = [inputIndex >= 0, jsonIndex >= 0, separatorIndex >= 0].filter(Boolean).length;
  if (modes > 1) throw new Error("use only one input form: --input, --json, stdin, or -- command");

  if (inputIndex >= 0) {
    const file = argv[inputIndex + 1];
    if (!file) throw new Error("--input requires a JSON file path");
    if (file.trimStart().startsWith("{")) throw new Error("--input expects a file path; use --json for inline JSON");
    if (argv.length !== 2) throw new Error("--input accepts exactly one JSON file path");
    return { inputFile: file };
  }

  if (jsonIndex >= 0) {
    const json = argv[jsonIndex + 1];
    if (!json) throw new Error("--json requires an inline JSON object");
    if (argv.length !== 2) throw new Error("--json accepts exactly one JSON value");
    return { request: JSON.parse(json) };
  }

  if (separatorIndex >= 0) {
    const request = { args: argv.slice(separatorIndex + 2) };
    request.program = argv[separatorIndex + 1];
    if (!request.program) throw new Error("-- must be followed by a program");
    const options = argv.slice(0, separatorIndex);
    const mappings = {
      "--cwd": ["cwd", String],
      "--timeout-ms": ["timeoutMs", positiveInteger],
      "--artifact-root": ["artifactRoot", String],
      "--success-preview-bytes": ["successPreviewBytes", positiveInteger],
      "--failure-preview-bytes": ["failurePreviewBytes", positiveInteger],
      "--hard-output-bytes": ["hardOutputBytes", positiveInteger],
      "--kill-grace-ms": ["killGraceMs", positiveInteger],
    };
    for (let index = 0; index < options.length; index += 2) {
      const option = options[index];
      const mapping = mappings[option];
      if (!mapping) throw new Error(`unknown option before --: ${option}`);
      const value = options[index + 1];
      if (value === undefined) throw new Error(`${option} requires a value`);
      request[mapping[0]] = mapping[1](value, option);
    }
    return { request };
  }

  if (argv.length > 0) throw new Error("unknown arguments; use --help for usage");
  return { stdin: true };
}

async function readRequest(argv) {
  const parsed = parseCliArguments(argv);
  if (parsed.help) return parsed;
  if (parsed.request) return parsed;
  if (parsed.inputFile) return { request: JSON.parse(await readFile(parsed.inputFile, "utf8")) };
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error("no request provided; use -- command, --json, --input, or stdin (see --help)");
  return { request: JSON.parse(input) };
}

async function main() {
  try {
    const parsed = await readRequest(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(`${HELP}\n`);
      return;
    }
    const result = await runBounded(parsed.request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "succeeded" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  }
}

if (existsSync(fileURLToPath(import.meta.url)) && process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
