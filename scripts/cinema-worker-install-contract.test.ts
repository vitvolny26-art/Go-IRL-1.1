import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/cinema-worker-install.yml", "utf8");
const workerctl = readFileSync("ops/workerctl/go-irl-cinema-workerctl", "utf8");
const deployCommandWorkflow = readFileSync(".github/workflows/vps-deploy-command.yml", "utf8");

describe("Cinema worker install contract", () => {
  it("keeps the governed command runtime-only unless config rewrite is explicitly requested", () => {
    expect(workflow).toContain("rewrite_config:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: ${{ inputs.rewrite_config }}");
    expect(deployCommandWorkflow).toContain('-f commit_sha="$TARGET_SHA"');
    expect(deployCommandWorkflow).not.toContain("rewrite_config=true");
  });

  it("wires TMDB only through the protected config rewrite path", () => {
    expect(workflow).toContain(
      "TMDB_API_READ_ACCESS_TOKEN: ${{ secrets.TMDB_API_READ_ACCESS_TOKEN }}",
    );
    expect(workflow).toContain('if [ -n "${TMDB_API_READ_ACCESS_TOKEN:-}" ]; then');
    expect(workflow).toContain(
      "printf 'TMDB_API_READ_ACCESS_TOKEN=%s\\n' \"$TMDB_API_READ_ACCESS_TOKEN\"",
    );
    expect(workflow).toContain("tmdb_enrichment_configured=true");
  });

  it("restarts and verifies the service only through the governed helper", () => {
    expect(workflow).toContain('sudo -n "$helper" restart');
    expect(workflow).toContain("cinema_worker_restart=ok");
    expect(workflow).not.toContain("sudo -n systemctl");
    expect(workerctl).toContain("restart_service()");
    expect(workerctl).toContain('systemctl restart "$SERVICE"');
    expect(workerctl).toContain("cinema_worker_service_restart=ok");
  });
});
