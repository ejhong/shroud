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

- `index.html`: illustrated inquiry, an identifiable archival face, the original Shadow Shroud physical-result photographs, evidence overview, and saved model outputs.
- `shadow.html`: start with Beauchamp’s original glass painting, paint/upload an opacity mask, adjust physical settings, animate integrated exposure, compare six matched-dose conditions, fit a target-informed mask, save/load experiments, and send an image into the depth lab.
- `depth.html`: published reconstruction references, synchronized unfiltered/adjusted height fields, horizontal and vertical profiles, known-geometry controls, and image/data exports.
- `methods.html`: sources, equations, assumptions, reproduction instructions, and image credits.
- `research.html`: laboratory funding priorities, a ranked direct-access program, a detailed Shadow Shroud replication protocol, decision criteria, and primary references.

## Implementation

`js/model.js` is the deterministic forward model and synthetic control generator. `js/worker.js` runs exposure integration off the main thread. `js/visuals.js` contains a WebGL height-field renderer, its canvas fallback, and the apparatus drawing. Completed exposures are saved locally and automatically become the depth lab’s latest sunlight result, across pages and tabs. Session storage provides a fallback. The explicit 3D button saves the selected playback frame. Without a saved result, the depth lab calculates a labeled example using Beauchamp’s glass painting. Fonts and images are served locally. Uploads stay in the browser. No analytics, paid APIs, generative image transformations, or remote computation are used.

The solar model uses local solar time, a NOAA declination approximation, an illustrative atmospheric weighting, ideal glass refraction, a five-ray approximation to the solar disc, and an explicitly assumed bleaching law. It is **not calibrated to real linen** and does not establish a historical or chemical match. See `methods.html` for the model's scope.

`scripts/build-results.mjs` regenerates the saved model images and numerical records from the same model used by the app. The default mask comes from David Beauchamp’s actual painting on glass, as photographed on Shadow Shroud. `js/paintings.js` records its source, face-only crop, and brightness-to-opacity mapping; no facial details are redrawn. `assets/results/beauchamp-mask.json` stores the browser extraction and original JPEG SHA-256 for the Node generator. To re-extract it, reset the sunlight lab, save the experiment, and retain its `painting` array and `inputProvenance`. The browser checks also write this export as `beauchamp-experiment.json` in their temporary downloads folder. `assets/results/beauchamp-mask.png` is a clean grayscale copy of the extracted mask for reuse. The stored `assets/results/face-target.json` is the app's 144-pixel-wide grayscale/normalized extraction of the supplied face scan, with an original-file SHA-256 and the transformation recorded. It can be re-extracted by choosing the Shroud face in the sunlight lab and saving the experiment's painting array before editing. `tests/model.test.mjs` checks physical and numerical invariants, including the exact transport adjoint and reduction of error in a target-informed fit.

## Publication

GitHub Pages publishes the root of `main`. `.nojekyll` keeps this a plain static site. All application links and workers use relative paths, including when hosted under `/shroud/`. Keep `assets`, `js`, and the HTML/CSS files together. `inputs` retains the original supplied code/images and is not required to serve the site. Run `node tests/browser.mjs https://ejhong.github.io/shroud/` to check the deployed pages with the same interaction suite.

## Sources and licenses

See `methods.html#images` for individual image provenance. Supplied scan attribution remains unverified; they are uncalibrated photographic inputs. Wikimedia’s face and full-cloth images have their sources recorded. Beauchamp’s glass photograph and Wilson’s three physical-result plates are credited and linked to their original gallery. Font licenses are in `assets/fonts`. The project's generated controls and model outputs are clearly distinguished from archival photographs and physical experiments.

## Reconstruction claim and depth comparison

`depth.html#reconstruction-story` connects the experiment with the VP-8 history and Ray Downing’s *The Real Face of Jesus?* project. Three credited source images distinguish an earlier relief, a project working view, and a later finished portrait. The lab does not reproduce the documentary’s complete workflow. `js/depth-model.js` calculates a polarity-matched baseline and independently adjusted height field; both views share camera, material, and relief scale. Horizontal and vertical profiles and JSON exports retain both fields. The Enrie reproduction provides another explicitly uncalibrated photographic input. See `methods.html#reconstruction` for the primary sources and limits of this comparison.

## Research agenda

`research.html` ranks five proposed investments across optics, calibrated imaging, fiber chemistry, radiocarbon/textiles, and ancient DNA. It includes a three-part Shadow Shroud replication protocol with controls, independent replication, and explicit interpretations for positive, negative, and inconclusive outcomes. Rankings and proposed protocols are editorial judgments grounded in the linked primary sources, not completed experiments or consensus conclusions. The page is fully readable without JavaScript.

The direct-access agenda at `research.html#direct-access` assumes access to both surfaces and agreed sampling. Its five expandable proposals prioritize mapped AMS radiocarbon dating, calibrated imaging, paired fiber chemistry, pollen/particles, and biological traces. It distinguishes funding rank from the order of a coordinated visit, explains pollen’s provenance limits, and connects measured image texture to the height-map question. Pollen context is sourced to Boi’s 2016/2017 primary study.
