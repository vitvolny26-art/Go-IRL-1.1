import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  BEGIN_MARKER,
  END_MARKER,
  parseVerificationCommand,
} = require("./verification-command.cjs");

const baseSha = "0123456789abcdef0123456789abcdef01234567";
const commitSha = "89abcdef0123456789abcdef0123456789abcdef";
const patch = [
  "diff --git a/docs/example.md b/docs/example.md",
  "new file mode 100644",
  "index 0000000..ce01362",
  "--- /dev/null",
  "+++ b/docs/example.md",
  "@@ -0,0 +1 @@",
  "+hello",
  "",
].join("\n");
const checksum = crypto.createHash("sha256").update(patch).digest("hex");
const patchCommand = (value = patch, digest = checksum) => [
  "/verify-patch " + baseSha + " " + digest,
  BEGIN_MARKER,
  value.slice(0, -1),
  END_MARKER,
].join("\n");
const verificationCommandCli = fileURLToPath(new URL("./verification-command.cjs", import.meta.url));

describe("AUTO125 verification command parser", () => {
  it("accepts one exact commit SHA", () => {
    expect(parseVerificationCommand("/verify-sha " + commitSha)).toEqual({
      kind: "sha",
      commitSha,
    });
  });

  it("rejects extra SHA command input", () => {
    expect(() => parseVerificationCommand("/verify-sha " + commitSha + " extra")).toThrow(/expected an exact/);
  });

  it("accepts a checksummed unified patch and preserves its bytes", () => {
    const parsed = parseVerificationCommand(patchCommand());
    expect(parsed).toMatchObject({ kind: "patch", baseSha, patchSha256: checksum });
    expect(parsed.patch).toBe(patch);
    expect(parsed.files).toEqual([{ before: "docs/example.md", after: "docs/example.md" }]);
  });

  it("writes GitHub outputs with numeric characters in key names", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto125-verification-command-"));
    try {
      const inputFile = path.join(tempDir, "comment.txt");
      const patchOutput = path.join(tempDir, "candidate.patch");
      const githubOutput = path.join(tempDir, "github-output.txt");
      fs.writeFileSync(inputFile, patchCommand(), "utf8");

      execFileSync(process.execPath, [
        verificationCommandCli,
        "--input",
        inputFile,
        "--patch-output",
        patchOutput,
        "--github-output",
        githubOutput,
      ]);

      expect(fs.readFileSync(patchOutput, "utf8")).toBe(patch);
      expect(fs.readFileSync(githubOutput, "utf8")).toBe([
        "kind=patch",
        "base_sha=" + baseSha,
        "patch_sha256=" + checksum,
        "file_count=1",
        "",
      ].join("\n"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("normalizes CRLF comments before hashing", () => {
    const parsed = parseVerificationCommand(patchCommand().replace(/\n/g, "\r\n"));
    expect(parsed.patchSha256).toBe(checksum);
  });

  it("fails closed on a checksum mismatch", () => {
    expect(() => parseVerificationCommand(patchCommand(patch, "0".repeat(64)))).toThrow(/checksum mismatch/);
  });

  it("fails closed when strict markers are missing", () => {
    expect(() => parseVerificationCommand("/verify-patch " + baseSha + " " + checksum + "\n" + patch)).toThrow(/expected .*BEGIN/);
  });

  it("blocks environment, credential, traversal, binary, symlink, and submodule patches", () => {
    const rejected = [
      patch.replaceAll("docs/example.md", ".env.production"),
      patch.replaceAll("docs/example.md", "config/credentials/app.json"),
      patch.replaceAll("docs/example.md", "../outside.txt"),
      patch.replace("+++ b/docs/example.md", "+++ b/.env"),
      patch + "diff --git \"a/.env\" \"b/.env\"\n",
      patch + "GIT binary patch\n",
      patch.replace("new file mode 100644", "new file mode 120000"),
      patch.replace("new file mode 100644", "new file mode 160000"),
      patch.replace("new file mode 100644", "deleted file mode 120000"),
      patch.replace("index 0000000..ce01362", "index 0000000..ce01362 160000"),
    ];
    for (const value of rejected) {
      const digest = crypto.createHash("sha256").update(value).digest("hex");
      expect(() => parseVerificationCommand(patchCommand(value, digest))).toThrow();
    }
  });
});

describe("AUTO125 workflow guardrails", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/verification-command.yml", import.meta.url), "utf8");

  it("is restricted to the control issue and repository owner", () => {
    expect(workflow).toContain("github.event.issue.number == 1121");
    expect(workflow).toContain("github.event.comment.user.login == github.repository_owner");
  });

  it("has no write permission beyond Actions dispatch", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("actions: write");
    expect(workflow).not.toMatch(/issues:\s*write/);
    expect(workflow).not.toMatch(/contents:\s*write/);
    const patchJob = workflow.slice(workflow.indexOf("  patch:"), workflow.indexOf("  sha:"));
    expect(patchJob).toMatch(/permissions:\n\s+contents: read/);
    expect(patchJob).not.toMatch(/actions:\s*write/);
  });

  it("dispatches only the existing verifier and never a deploy workflow", () => {
    expect(workflow).toContain("gh workflow run self-hosted-verify.yml");
    expect(workflow).not.toContain("vps-deploy.yml");
    expect(workflow).not.toContain("repository_dispatch");
  });
});
