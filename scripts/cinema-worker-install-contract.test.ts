import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/cinema-worker-install.yml", "utf8");
const workerctl = readFileSync("ops/workerctl/go-irl-cinema-workerctl", "utf8");
const worker = readFileSync("scripts/cinema-ingestion-worker.ts", "utf8");
const deployCommandWorkflow = readFileSync(".github/workflows/vps-deploy-command.yml", "utf8");
const workerTsconfig = readFileSync("tsconfig.cinema-ingestion-worker.json", "utf8");

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

  it("includes the compact Cinema publication materializer in the worker artifact", () => {
    expect(workerTsconfig).toContain('"api/_shared/cinema-daily-candidate-publication.ts"');
    expect(workflow).toContain("pnpm run build:cinema-ingestion-worker");
  });

  it("exposes one exact catalog movie publication without an arbitrary shell or batch input", () => {
    expect(worker).toContain('args.includes("--publish-exact")');
    expect(worker).toContain('args.length !== 2 || catalogMovieArguments.length !== 1');
    expect(worker).toContain('input: { catalogMovieId }');
    expect(worker).toContain('eventIds: [eventId]');
    expect(worker).toContain('action: "publish_city_poster_events"');
    expect(worker).not.toContain("catalogMovieIds");
    expect(workerctl).toContain("publish_exact()");
    expect(workerctl).toContain("require_uuid \"$catalog_movie_id\"");
    expect(workerctl).toContain('--property="EnvironmentFile=$ENV_FILE"');
    expect(workerctl).toContain('/usr/bin/node "$WORKER" --publish-exact "--catalog-movie-id=$catalog_movie_id"');
    expect(workerctl).not.toMatch(/publish_exact\(\)[\s\S]*?\b(?:sh|bash)\s+-c\b/);
  });

  it("restarts through the governed helper with a bounded legacy-helper fallback", () => {
    expect(workflow).toContain('sudo -n "$helper" restart');
    expect(workflow).toContain("grep -q 'allowed actions:.*start <sha>'");
    expect(workflow).toContain('test "$(stat -c %u "/proc/$previous_pid")" = "$(id -u)"');
    expect(workflow).toContain('kill -KILL "$previous_pid"');
    expect(workflow).toContain('sudo -n "$helper" start "$requested"');
    expect(workflow).toContain("cinema_worker_legacy_restart=ok");
    expect(workflow).toContain("cinema_worker_restart=ok");
    expect(workflow).not.toContain("sudo -n systemctl");
    expect(workerctl).toContain("restart_service()");
    expect(workerctl).toContain('systemctl restart "$SERVICE"');
    expect(workerctl).toContain("cinema_worker_service_restart=ok");
  });
});
