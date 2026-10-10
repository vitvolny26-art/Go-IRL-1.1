# SPORT001 — Emblem acquisition package

This package prepares official team emblems for GO IRL City Posters without touching production.

## What it does

- reads `sport001_emblem_sources.json`;
- downloads only entries with `official_asset_url`;
- normalizes each emblem to a 512×512 transparent PNG canvas;
- writes files to `assets/`;
- writes `download_results.json` with status, dimensions and SHA-256.

All current SPORT001 entries have stable direct official image URLs. Future entries without a stable direct image URL are reported as `missing_direct_url`; they should stay in the manifest until the resolver step fills them from the official source page.

## Run

```bash
python -m pip install Pillow
python download_emblems.py
```

Optional:

```bash
python download_emblems.py --manifest sport001_emblem_sources.json --output-dir assets --report download_results.json
python download_emblems.py --check-only --report coverage_results.json
```

## Production boundary

The script does not upload to Supabase Storage, does not change database rows, and does not publish City Posters. Use the JSON report as review evidence before any production upload step.
