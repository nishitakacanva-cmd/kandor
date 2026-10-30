# Kandor V2 handover and scaling notes

Implemented now:

- Kept the current single-page vanilla HTML/CSS/JavaScript structure and Cloudflare Pages Function layout.
- Added 24 catalogue entries, bringing the page to 74 products.
- Added a single product/image mapping used by catalogue listings, product detail, saved products and comparison.
- Added exact-match evidence metadata for the demo packshots and neutral placeholders for unresolved images.
- Preserved existing legacy scores but labeled them as legacy demo data. New products are `Not assessed`.
- Added keyboard focus-visible, pressed, disabled, and persistent selected-state styling without changing the navigation model.
- Documented the current scoring mismatch: the methodology screen states 35/35/30 for Eco/Health/Value, while the current overall display averages the three dimensions equally. V2 does not silently change the scoring system.

Future architecture:

1. Maintain an indexed barcode table keyed by normalized GTIN, with a verified product record and a source snapshot.
2. Cache immutable product/evidence records at the edge, with explicit expiry and manual review for changes.
3. Move scoring into a versioned evidence-backed service. Store rubric version, input completeness, evidence URLs and calculation trace with every score.
4. Use image recognition only as an explicit identification fallback; never turn a photo-only guess into a verified sustainability score.
5. Add a permitted local image asset pipeline with checksums, dimensions, alt text and a license/reuse field.

Scanning speed/reliability was intentionally not changed in this pass, per the requested scope. Physical phone-camera behavior remains untested here.

