const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BEGIN_MARKER = "-----BEGIN GO IRL PATCH-----";
const END_MARKER = "-----END GO IRL PATCH-----";
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_PATCH_FILES = 100;

const blockedPathSegment = (segment) => {
  const normalized = segment.toLowerCase();
  return normalized === ".git"
    || normalized === ".env"
    || normalized.startsWith(".env.")
    || /^(?:secrets?|credentials?)$/.test(normalized)
    || normalized === "production-data";
};

const assertSafePath = (candidate) => {
  if (!candidate || candidate.startsWith("/") || candidate.includes("\\")) {
    throw new Error("unsafe patch path: " + (candidate || "<empty>"));
  }
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || blockedPathSegment(segment))) {
    throw new Error("blocked patch path: " + candidate);
  }
};

const validatePatch = (patch) => {
  const size = Buffer.byteLength(patch, "utf8");
  if (size === 0 || size > MAX_PATCH_BYTES) throw new Error("patch size must be 1-" + MAX_PATCH_BYTES + " bytes");
  if (patch.includes("\0")) throw new Error("patch contains a NUL byte");
  if (!patch.startsWith("diff --git ")) throw new Error("patch must start with a git unified diff header");
  if (/^(?:GIT binary patch|Binary files )/m.test(patch)) throw new Error("binary patches are not allowed");
  if (/^(?:(?:new|deleted) file mode|old mode|new mode) 120000$/m.test(patch)
    || /^index [0-9a-f]+\.\.[0-9a-f]+ 120000$/m.test(patch)) {
    throw new Error("symlink patches are not allowed");
  }
  if (/^(?:(?:new|deleted) file mode|old mode|new mode) 160000$/m.test(patch)
    || /^index [0-9a-f]+\.\.[0-9a-f]+ 160000$/m.test(patch)) {
    throw new Error("submodule patches are not allowed");
  }

  const allHeaderCount = [...patch.matchAll(/^diff --git /gm)].length;
  const headers = [...patch.matchAll(/^diff --git a\/([^\s]+) b\/([^\s]+)$/gm)];
  if (headers.length === 0) throw new Error("patch has no valid diff headers");
  if (headers.length !== allHeaderCount) throw new Error("quoted or malformed diff headers are not allowed");
  if (headers.length > MAX_PATCH_FILES) throw new Error("patch changes more than " + MAX_PATCH_FILES + " files");
  for (const match of headers) {
    assertSafePath(match[1]);
    assertSafePath(match[2]);
  }
  for (const match of patch.matchAll(/^(?:---|\+\+\+) ([^\n]+)$/gm)) {
    if (match[1] === "/dev/null") continue;
    if (!/^[ab]\//.test(match[1])) throw new Error("malformed patch metadata path: " + match[1]);
    assertSafePath(match[1].slice(2));
  }
  for (const match of patch.matchAll(/^(?:rename|copy) (?:from|to) ([^\n]+)$/gm)) {
    assertSafePath(match[1]);
  }
  return headers.map((match) => ({ before: match[1], after: match[2] }));
};

const parsePatchCommand = (body) => {
  const firstNewline = body.indexOf("\n");
  if (firstNewline === -1) throw new Error("verify-patch requires markers and a unified patch payload");
  const command = body.slice(0, firstNewline);
  const commandMatch = command.match(/^\/verify-patch ([0-9a-fA-F]{40}) ([0-9a-fA-F]{64})$/);
  if (!commandMatch) throw new Error("expected /verify-patch <40-char-base-SHA> <64-char-patch-SHA256>");

  const payloadStart = firstNewline + 1 + BEGIN_MARKER.length + 1;
  if (body.slice(firstNewline + 1, payloadStart) !== BEGIN_MARKER + "\n") {
    throw new Error("expected " + BEGIN_MARKER + " immediately after the command");
  }
  const markerIndex = body.indexOf("\n" + END_MARKER, payloadStart);
  if (markerIndex === -1) throw new Error("missing " + END_MARKER);
  const suffix = body.slice(markerIndex + 1);
  if (suffix !== END_MARKER && suffix !== END_MARKER + "\n") {
    throw new Error("unexpected content after the patch end marker");
  }

  const patch = body.slice(payloadStart, markerIndex + 1);
  const files = validatePatch(patch);
  const actualChecksum = crypto.createHash("sha256").update(patch, "utf8").digest("hex");
  const expectedChecksum = commandMatch[2].toLowerCase();
  if (actualChecksum !== expectedChecksum) {
    throw new Error("patch checksum mismatch: expected " + expectedChecksum + ", got " + actualChecksum);
  }
  return {
    kind: "patch",
    baseSha: commandMatch[1].toLowerCase(),
    patchSha256: actualChecksum,
    patch,
    files,
  };
};

const parseVerificationCommand = (rawBody) => {
  if (typeof rawBody !== "string") throw new Error("comment body must be a string");
  const body = rawBody.replace(/\r\n/g, "\n");
  const shaMatch = body.match(/^\/verify-sha ([0-9a-fA-F]{40})\n?$/);
  if (shaMatch) return { kind: "sha", commitSha: shaMatch[1].toLowerCase() };
  if (body.startsWith("/verify-patch")) return parsePatchCommand(body);
  throw new Error("expected an exact /verify-patch or /verify-sha command");
};

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
};

const appendOutput = (outputFile, key, value) => {
  if (!/^[a-z_]+$/.test(key) || /[\r\n]/.test(value)) throw new Error("invalid GitHub output");
  fs.appendFileSync(outputFile, key + "=" + value + "\n", "utf8");
};

const runCli = () => {
  const inputFile = readArgument("--input");
  const patchOutput = readArgument("--patch-output");
  const githubOutput = readArgument("--github-output");
  if (!inputFile || !patchOutput || !githubOutput) {
    throw new Error("usage: --input <file> --patch-output <file> --github-output <file>");
  }
  const parsed = parseVerificationCommand(fs.readFileSync(inputFile, "utf8"));
  appendOutput(githubOutput, "kind", parsed.kind);
  if (parsed.kind === "sha") {
    appendOutput(githubOutput, "commit_sha", parsed.commitSha);
    return;
  }
  fs.mkdirSync(path.dirname(patchOutput), { recursive: true });
  fs.writeFileSync(patchOutput, parsed.patch, { encoding: "utf8", mode: 0o600 });
  appendOutput(githubOutput, "base_sha", parsed.baseSha);
  appendOutput(githubOutput, "patch_sha256", parsed.patchSha256);
  appendOutput(githubOutput, "file_count", String(parsed.files.length));
};

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error("BLOCKED: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

module.exports = {
  BEGIN_MARKER,
  END_MARKER,
  MAX_PATCH_BYTES,
  parseVerificationCommand,
  validatePatch,
};
