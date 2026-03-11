# Camp Sites

This directory is for campsite preference analysis and a constrained target list.

Contents:
- `SCR-20260310-nwgo.png`: campground map image reference
- `site-list.md`: raw visible site inventory from the map
- `preferred-sites.md`: curated ranked allowlist for automated runs

Use `preferred-sites.md` with:
- `npm run race -- --siteList preferred-sites ...`
- `npm run release -- --siteList preferred-sites ...`
- `npm run availability -- --siteList preferred-sites ...`
- `npm run site-availability -- --siteList preferred-sites ...`

File format:
- `## Top choices`
- `## Backups`
- `## Exclude`

The runtime derives the final allowlist as `Top choices + Backups - Exclude`.

For monthly planning reports:
- `npm run site-availability -- --dateFrom 07/01/2026 --dateTo 07/31/2026 -l 1 -o BIRCH --siteList preferred-sites --concurrency 4 --out "camp sites/site-availability-2026-07.md"`
