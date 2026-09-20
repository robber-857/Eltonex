# ELTONEX hero film — Gold Horizon

Original 12-second, silent CGI loop: the exact ELTONEX rocket appears as a monumental graphite-and-gold sculpture above a dark basalt landscape and luminous warm horizon. The left area remains quiet for the portfolio copy. This complete scene replaces the earlier metal-fold background and the live foreground rocket.

## Delivery

- `../../assets/hero-cinematic.mp4` — 1600×900, 24fps, H.264/yuv420p, no audio, fast start.
- `../../assets/hero-cinematic-poster.jpg` — midpoint still.
- `index.html` / `film.js` — editable deterministic HyperFrames/Three.js source.
- `rocket-mark.svg` — exact source brand geometry, copied from the existing ELTONEX asset; its solid fills identify model materials.
- `vendor/` — local Three.js 0.170.0, SVGLoader and MIT license. The one local SVG request finishes before any render-critical seek; there are no external asset requests.

The native Three.js adapter uses `hf-seek` and an explicit 12-second root duration. `data-no-timeline` declares that no GSAP timeline is needed. All animated state derives from a modulo-12-second phase; the capture at exactly 0 and 12 seconds is identical. No live pointer state or wall-clock animation is used.

## Render and checks

This source was initialized with HyperFrames **0.8.47**. Its combined `check` covers lint, runtime, layout, motion and contrast. The source is a full-frame canvas without text, so text contrast is checked on the website instead.

On this Windows host, `hyperframes render` failed its browser preflight before capture:

```
Chrome cannot start
Failed to run "C:\Program Files\Google\Chrome\Application\chrome.exe" --version (exit code 21).
```

The same browser launches correctly from Playwright and HyperFrames `check`. The final film therefore uses `render-local.cjs`: it seeks the same authored `hf-seek` composition to frame/24, captures 288 frames, and streams them to local FFmpeg with libx264 CRF 23 / slow. The encoded interval excludes the duplicated endpoint. Telemetry and external publication were disabled.

Verified delivery metadata is recorded in `validation.json`: **12.000 seconds**, **288 frames**, **24fps**, **1600×900**, H.264/yuv420p, no audio stream. HyperFrames combined check completed with **zero errors and zero warnings**. The 0-second and 12-second source frames compare byte-for-byte equal. The last encoded frame is the normal one-frame step before the first frame, without a duplicated pause frame.

From `personal-site`, with the local preview server listening on 4173:

```powershell
$env:npm_config_cache = "$PWD\output\npm-cache"
$env:HYPERFRAMES_NO_TELEMETRY = '1'
$env:HYPERFRAMES_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd install --prefix output/film-runtime --no-audit --no-fund playwright @ffmpeg-installer/win32-x64 @ffprobe-installer/win32-x64
npx.cmd --yes hyperframes@0.8.47 check media/hero-film --json --at 0,6,11.958333
node media/hero-film/render-local.cjs inspect
node media/hero-film/render-local.cjs render
```

`inspect` writes midpoint and seam captures plus a byte-equality report to ignored `output/hero-film/`. `render` writes only the finished MP4 and poster to `assets/`. The website embeds the MP4; it does not run this Three.js composition.
