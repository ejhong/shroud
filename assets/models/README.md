# Reference head

`moraes-head.json` is adapted from **Cicero Moraes, Data – 3D files – Shroud of Turin** (2025), [doi:10.6084/m9.figshare.29645060](https://doi.org/10.6084/m9.figshare.29645060), released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The input is the stored `human_3-base` mesh in `Body_3D.blend`. We crop its head and rasterize the frontmost surface into a 121 × 149 height field. The coordinate transform, original file SHA-256, assumed physical scale, and rounding are recorded in the JSON. Geometry includes the model's hair and beard. The source is a digital reference figure, not a scan of the person on the Shroud.

Regenerate with `python3 scripts/prepare-cloth-head.py /path/to/Body_3D.blend` after downloading and extracting the [original archive](https://ndownloader.figshare.com/files/56548874). Only Python's standard library is needed. Blender modifiers, cloth simulation, materials and scene transforms are not evaluated.

The browser's shallow relief compresses this same height field; it does not use the study's `Low_relief.blend`. The browser's independent-strip calculation is our own educational model, **not a reproduction of Moraes's fabric-dynamics experiment**. The original research is [Image Formation on the Holy Shroud—A Digital 3D Approach](https://doi.org/10.1111/arcm.70030).
