# Three.js runtime

Vendored from **Three.js 0.170.0 (r170)** so the hero makes no third-party runtime requests.

- `three.module.min.js`: https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js
- `SVGLoader.js`: https://github.com/mrdoob/three.js/blob/r170/examples/jsm/loaders/SVGLoader.js
- `THREE-LICENSE.txt`: upstream MIT license.

The only loader modification is its import specifier, changed from `three` to the adjacent local module.
