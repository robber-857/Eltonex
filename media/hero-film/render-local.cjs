// Deterministic local capture fallback for Windows HyperFrames Chrome preflight.
// Usage: node media/hero-film/render-local.cjs [inspect|render]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../..');
const npmCache = path.join(root, 'output/npm-cache/_npx');
const playwrightCandidates = [
  path.join(root, 'output/film-runtime/node_modules/playwright'),
  ...(fs.existsSync(npmCache) ? fs.readdirSync(npmCache) : [])
    .map(entry => path.join(npmCache, entry, 'node_modules/playwright')),
];
const playwrightPath = playwrightCandidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
if (!playwrightPath) throw new Error('Install Playwright under output/film-runtime before rendering.');
const { chromium } = require(playwrightPath);
const ffmpeg = path.join(root, 'output/film-runtime/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
const output = path.join(root, 'output/hero-film');
fs.mkdirSync(output, { recursive: true });
const mode = process.argv[2] || 'inspect';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HYPERFRAMES_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/media/hero-film/index.html');
  await page.waitForFunction(() => window.__filmReady === true);
  const seek = time => page.evaluate(time => { window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time } })); }, time);
  if (mode === 'inspect') {
    await seek(6);
    await page.screenshot({ path: path.join(output, 'midpoint.png') });
    await page.screenshot({ path: path.join(root, 'assets/hero-cinematic-poster.jpg'), type: 'jpeg', quality: 87 });
    await seek(0);
    const first = await page.screenshot({ path: path.join(output, 'seam-first.png') });
    await seek(12);
    const last = await page.screenshot({ path: path.join(output, 'seam-end.png') });
    await seek(11.9583333333333);
    await page.screenshot({ path: path.join(output, 'last-encoded-frame.png') });
    const report = { width: 1600, height: 900, duration: 12, fps: 24, frames: 288, exactSeamEqual: first.equals(last), errors };
    fs.writeFileSync(path.join(output, 'composition-check.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } else {
    const filename = path.join(root, 'assets/hero-cinematic.mp4');
    const encoder = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '24', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', '-map_metadata', '-1', filename]);
    encoder.stderr.on('data', data => process.stderr.write(data));
    let failed = false;
    encoder.on('error', error => { failed = true; console.error(error); });
    for (let frame = 0; frame < 288; frame += 1) {
      if (failed) throw new Error('FFmpeg failed');
      await seek(frame / 24);
      const buffer = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!encoder.stdin.write(buffer)) await once(encoder.stdin, 'drain');
      if (frame % 24 === 0) console.log(`Rendered ${frame}/288 frames`);
    }
    encoder.stdin.end();
    const [code] = await once(encoder, 'close');
    if (code !== 0) throw new Error(`FFmpeg failed with exit ${code}`);
    await seek(6);
    await page.screenshot({ path: path.join(root, 'assets/hero-cinematic-poster.jpg'), type: 'jpeg', quality: 87 });
    console.log(JSON.stringify({ file: filename, bytes: fs.statSync(filename).size, errors }));
  }
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
