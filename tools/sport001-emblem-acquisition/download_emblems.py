#!/usr/bin/env python3
"""Download and verify SPORT001 team emblems from governed official sources.

The script is intentionally offline-safe for production: it writes only to a local
assets directory and a JSON report. It does not upload to Supabase or modify the
GO IRL database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - exercised by operator setup
    raise SystemExit("Pillow is required. Install with: python -m pip install Pillow") from exc

USER_AGENT = "GO-IRL-SPORT001-emblem-acquisition/1.0 (+https://go-irl.fun)"
DEFAULT_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class EmblemResult:
    team_id: str
    team_name: str
    sport: str
    status: str
    source_url: str | None = None
    official_asset_url: str | None = None
    output_file: str | None = None
    original_format: str | None = None
    output_format: str | None = None
    original_size: list[int] | None = None
    output_size: list[int] | None = None
    sha256: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in self.__dict__.items() if value is not None}


def slug_filename(team_id: str) -> str:
    return team_id.strip("/").replace("/", "__") + ".png"


def fetch_bytes(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        status = getattr(response, "status", 200)
        if status < 200 or status >= 300:
            raise RuntimeError(f"HTTP {status}")
        return response.read()


def normalize_png(raw: bytes, canvas: int) -> tuple[bytes, str, tuple[int, int]]:
    with Image.open(BytesIO(raw)) as image:
        original_format = image.format or "unknown"
        original_size = image.size
        image = image.convert("RGBA")
        image.thumbnail((canvas, canvas), Image.Resampling.LANCZOS)
        output = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        offset = ((canvas - image.width) // 2, (canvas - image.height) // 2)
        output.alpha_composite(image, offset)
        buffer = BytesIO()
        output.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue(), original_format, original_size


def process_team(team: dict[str, Any], output_dir: Path, canvas: int, timeout: int, delay: float) -> EmblemResult:
    asset_url = team.get("official_asset_url")
    base = {
        "team_id": team["team_id"],
        "team_name": team["team_name"],
        "sport": team["sport"],
        "source_url": team.get("source_url"),
        "official_asset_url": asset_url,
    }
    if not asset_url:
        return EmblemResult(status="missing_direct_url", **base)

    try:
        if delay > 0:
            time.sleep(delay)
        raw = fetch_bytes(asset_url, timeout=timeout)
        png, original_format, original_size = normalize_png(raw, canvas=canvas)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / slug_filename(team["team_id"])
        output_file.write_bytes(png)
        return EmblemResult(
            status="downloaded",
            output_file=str(output_file),
            original_format=original_format.lower(),
            output_format="png",
            original_size=[original_size[0], original_size[1]],
            output_size=[canvas, canvas],
            sha256=hashlib.sha256(png).hexdigest(),
            **base,
        )
    except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
        return EmblemResult(status="download_failed", error=str(exc), **base)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download and verify SPORT001 official team emblems.")
    parser.add_argument("--manifest", default="sport001_emblem_sources.json", help="Path to source manifest JSON")
    parser.add_argument("--output-dir", default="assets", help="Directory for normalized PNG files")
    parser.add_argument("--report", default="download_results.json", help="Output JSON report path")
    parser.add_argument("--canvas", type=int, default=512, help="Square PNG canvas size")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP timeout in seconds")
    parser.add_argument("--delay", type=float, default=0.25, help="Delay between downloads in seconds")
    parser.add_argument("--check-only", action="store_true", help="Validate manifest and report direct URL coverage without downloading")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    teams = manifest.get("teams", [])
    if args.check_only:
        results = [
            EmblemResult(
                team_id=team["team_id"],
                team_name=team["team_name"],
                sport=team["sport"],
                status="ready" if team.get("official_asset_url") else "missing_direct_url",
                source_url=team.get("source_url"),
                official_asset_url=team.get("official_asset_url"),
            ).to_dict()
            for team in teams
        ]
    else:
        results = [
            process_team(team, Path(args.output_dir), args.canvas, args.timeout, args.delay).to_dict()
            for team in teams
        ]
    summary = {
        "task": manifest.get("task", "SPORT001"),
        "total": len(results),
        "downloaded": sum(1 for item in results if item["status"] == "downloaded"),
        "ready": sum(1 for item in results if item["status"] == "ready"),
        "missing_direct_url": sum(1 for item in results if item["status"] == "missing_direct_url"),
        "download_failed": sum(1 for item in results if item["status"] == "download_failed"),
        "canvas": [args.canvas, args.canvas],
    }
    report = {"summary": summary, "results": results}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["download_failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
