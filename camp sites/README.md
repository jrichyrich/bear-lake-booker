# Camp Sites

This directory is for campsite preference analysis and a constrained target list.

Contents:
- `SCR-20260310-nwgo.png`: campground map image reference
- `site-list.md`: raw visible site inventory from the map
- `preferred-sites.md`: curated ranked allowlist for automated runs

Use `preferred-sites.md` with:
- `npm run race -- --siteList preferred-sites ...`
- `npm run release -- --siteList preferred-sites ...`

File format:
- `## Top choices`
- `## Backups`
- `## Exclude`

The runtime derives the final allowlist as `Top choices + Backups - Exclude`.
