# The Shroud — an open inquiry

A static, self-contained research site with an illustrated narrative, a moving-sun bleaching simulator, and a 3D brightness-to-height lab. Its visual language follows Birdmen / Deep Memory.

Website: https://ejhong.github.io/shroud/ · Repository: https://github.com/ejhong/shroud

## Run

Requires Node 22 or newer. There are no npm dependencies and no build step.

```sh
npm run dev
# http://127.0.0.1:4173
npm test
npm run check
npm run results
npm run test:browser
```

The browser check uses installed Google Chrome on macOS, with a temporary profile. Set `SHROUD_CHROME` for another Chromium executable and `SHROUD_SITE_URL` for another server URL. Set `PORT` for the preview server. It never uses a personal browser session.

## Pages

- `index.html`: an archival face, direct entrances to all three labs, the cloth, physical Shadow Shroud trials, an evidence overview, and clearly labeled model outputs.
- `shadow.html`: start with Beauchamp’s original glass painting, paint/upload an opacity mask, adjust physical settings, animate integrated exposure, compare six matched-dose conditions, fit a target-informed mask, save/load experiments, and send an image into the depth lab.
- `depth.html`: opens in cloth–body reconstruction mode, with direct brightness relief available for comparison, profiles, known-geometry tests, and full data exports; documentary references follow the experiment.
- `cloth.html`: wrap a known reference face or a shallow relief, unfold the cloth, compare imprints at one scale, measure lateral widening, and export the calculation.
- `methods.html`: grouped navigation through evidence, model equations, reproduction instructions, and image credits.
- `research.html`: one ranked agenda of ten distinct studies, access requirements, a detailed Shadow Shroud protocol, decision criteria, and primary references.

## Implementation

`js/model.js` is the deterministic forward model and synthetic control generator. `js/worker.js` runs exposure integration off the main thread. `js/visuals.js` contains a WebGL height-field renderer, its canvas fallback, and the apparatus drawing. Completed exposures are saved locally and automatically become the depth lab’s latest sunlight result, across pages and tabs. Session storage provides a fallback. The explicit 3D button saves the selected playback frame. Without a saved result, the depth lab calculates a labeled example using Beauchamp’s glass painting. The homepage uses saved model renders, so its previews work without JavaScript or WebGL. Fonts and images are served locally. Uploads stay in the browser. No analytics, paid APIs, generative image transformations, or remote computation are used.

The solar model uses local solar time, a NOAA declination approximation, an illustrative atmospheric weighting, ideal glass refraction, a five-ray approximation to the solar disc, and an explicitly assumed bleaching law. It is **not calibrated to real linen** and does not establish a historical or chemical match. See `methods.html` for the model's scope.

`scripts/build-results.mjs` regenerates the saved model images and numerical records from the same model used by the app. The default mask comes from David Beauchamp’s actual painting on glass, as photographed on Shadow Shroud. `js/paintings.js` records its source, face-only crop, and brightness-to-opacity mapping; no facial details are redrawn. `assets/results/beauchamp-mask.json` stores the browser extraction and original JPEG SHA-256 for the Node generator. To re-extract it, reset the sunlight lab, save the experiment, and retain its `painting` array and `inputProvenance`. The browser checks also write this export as `beauchamp-experiment.json` in their temporary downloads folder. `assets/results/beauchamp-mask.png` is a clean grayscale copy of the extracted mask for reuse. The stored `assets/results/face-target.json` is the app's 144-pixel-wide grayscale/normalized extraction of the supplied face scan, with an original-file SHA-256 and the transformation recorded. It can be re-extracted by choosing the Shroud face in the sunlight lab and saving the experiment's painting array before editing. `tests/model.test.mjs` checks physical and numerical invariants, including the exact transport adjoint and reduction of error in a target-informed fit.

## Publication

GitHub Pages publishes the root of `main`. `.nojekyll` keeps this a plain static site. All application links and workers use relative paths, including when hosted under `/shroud/`. Keep `assets`, `js`, and the HTML/CSS files together. `inputs` retains the original supplied code/images and is not required to serve the site. Run `node tests/browser.mjs https://ejhong.github.io/shroud/` to check the deployed pages with the same interaction suite.

## Sources and licenses

See `methods.html#images` for individual image provenance. Supplied scan attribution remains unverified; they are uncalibrated photographic inputs. Wikimedia’s face and full-cloth images have their sources recorded. Beauchamp’s glass photograph and Wilson’s three physical-result plates are credited and linked to their original gallery. Font licenses are in `assets/fonts`. The project's generated controls and model outputs are clearly distinguished from archival photographs and physical experiments.

## Reconstruction claim and depth comparison

`depth.html#reconstruction-story` connects the experiment with the VP-8 history and Ray Downing’s *The Real Face of Jesus?* project. Credited images distinguish a relief, a working view, and a later portrait. The default `depth.html` view explores the published cloth–body-distance principle; it is not an exact replication of Downing’s undocumented numerical pipeline.

`js/depth-model.js` preserves the direct-brightness comparison and adds two inverse distance laws, flat/parabolic cloth surfaces, and an explicit reference-assisted option. The latter supplies a featureless oval cap and adds high-frequency image detail. Every assumed surface is inspectable; x/y are unchanged, with no lateral cloth unwrapping or cloth mechanics. Model millimetres use an assumed image width and gap range, never an image-derived anatomical calibration. Both panels use one physical scale without vertical exaggeration. The saved home-page example shares the default curved-cloth reconstruction, 180-pixel source grid, processing settings, and camera. After changing those defaults or the apparatus renderer, start `npm run dev` and run `npm run previews` (installed Chrome required). The renderer checks for nonblank output and writes five PNGs plus their settings to `assets/results/home-previews.json`. `depth.html?mode=brightness` opens the direct-relief comparison.

The known-distance control starts from fixed independent synthetic geometry and encodes its vertical gap beneath a known cloth. Correct settings recover it to floating-point precision; wrong drape, law, range, or tonal processing produce measurable full-grid RMSE. This is an internal numerical check, not physical validation. Reconstruction JSON includes the input, signal, gap, cloth, body, optional broad reference and control truth, settings, coordinate definitions, and model version. Direct-mode exports retain the original baseline/adjusted format. See `methods.html#cloth-distance` for equations and limitations.

## Research agenda

`research.html#priorities` is one ordered list of ten distinct studies: mapped radiocarbon dating, image chemistry, calibrated imaging, Shadow Shroud replication, a known-geometry 3D benchmark, textile manufacture/repairs, red-stain composition/sequence, documentary provenance, pollen/particles, and DNA authentication. Each entry states its question, access needs, method, decision, limits, and first deliverable. Rankings and protocols are editorial judgments grounded in the linked primary sources.

Native disclosure controls keep the list readable without JavaScript. `js/research.js` expands a linked study automatically, preserves earlier access-specific anchors, and includes every study when printing. The former two overlapping agendas have been consolidated; `#direct-access` now leads to the unified list.

## Cloth wrapping experiment

`cloth.html` tests the forward geometric question omitted by the depth lab: how a known form maps onto cloth, and how that image changes when the cloth is laid flat. The reference head is extracted from Cicero Moraes's openly licensed research geometry. It is a control, not a reconstruction of the Shroud's person. `assets/models/README.md` gives attribution, source links, coordinate changes, and the dependency-free regeneration command. The relief scales the same reference depth; it is not the paper's separate low-relief model.

`js/cloth-model.js` constructs a least-concave envelope over each horizontal profile and interpolates between it and a flat plane. Each independent 700 mm strip is registered at projected x=0. Unfolding reduces segment angles while preserving their lengths; a signal remains fixed in material coordinates. Distance and contact rules are explicitly illustrative. Both output images share physical and tonal scales. A 120 mm projected guide span measures local lateral widening at the selected row.

This is **not a woven-sheet mechanics solver**: there is no coupling between strips, so longitudinal strain and shear are not solved. Nor does it reproduce Moraes's Blender cloth simulation or score a fit to the Shroud. The connected display mesh is an illustration of the independent sections. `methods.html#cloth-wrap` gives the equations and limits.

`js/cloth-visuals.js` renders the reference mesh, animated cloth, imprints, and section plot, with a Canvas 2D fallback when WebGL is unavailable. Keyboard rotation and zoom, reduced-motion playback, and mobile layouts are supported. `tests/cloth.test.mjs` checks analytic semicircle flattening, segment-length conservation, nonpenetration, flat-cloth identity, equal-form identity, transfer independence, and material-coordinate persistence. Browser checks exercise controls, both animation modes, fallback rendering, 320px layouts, PNG/data downloads, and exact reproduction of downloaded signals in Node.

The homepage illustration and saved default comparison are generated by `npm run previews` from the same live model; they remain visible without JavaScript. The PNG export includes settings, equal-scale imprints, geometry attribution, and model version. The JSON includes both signals, gaps, mapped positions, strip paths, input geometry, settings, and provenance.
