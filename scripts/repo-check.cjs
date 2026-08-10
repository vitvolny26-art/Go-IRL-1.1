const { execFileSync } = require("node:child_process");
const { statSync } = require("node:fs");

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);

const forbiddenExact = new Set([
  "package-lock.json",
  ".env",
  ".env.local",
]);

const forbiddenPrefixes = [
  "node_modules/",
  "dist/",
  ".vercel/",
  "GO IRL DOC/",
  "GO IRL DOC FULL/",
  "supabase/.temp/",
];

const forbiddenSuffixes = [
  ".tsbuildinfo",
  ".log",
  ".bak",
  ".backup",
  ".tmp",
];

const violations = [];
const largeFiles = [];
const largeFileThresholdBytes = 5 * 1024 * 1024;

for (const file of trackedFiles) {
  if (
    forbiddenExact.has(file) ||
    forbiddenPrefixes.some((prefix) => file.startsWith(prefix)) ||
    forbiddenSuffixes.some((suffix) => file.endsWith(suffix))
  ) {
    violations.push(file);
  }

  try {
    const size = statSync(file).size;
    if (size > largeFileThresholdBytes) {
      largeFiles.push({ file, size });
    }
  } catch {
    violations.push(`${file} (tracked but missing from working tree)`);
  }
}

if (largeFiles.length > 0) {
  console.warn("Tracked files larger than 5 MiB (review manually):");
  for (const { file, size } of largeFiles.sort((a, b) => b.size - a.size)) {
    console.warn(`- ${file}: ${(size / 1024 / 1024).toFixed(2)} MiB`);
  }
}

if (violations.length > 0) {
  console.error("Repository hygiene violations:");
  for (const file of [...new Set(violations)].sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`Repository hygiene PASS (${trackedFiles.length} tracked files checked).`);
