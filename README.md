# ELTONEX personal site preview

Static multi-page preview for the ELTONEX personal website.

## Preview locally

From this folder, run a static server and open the reported localhost URL:

```powershell
node preview-server.cjs
```

Pages:

- `index.html` — landing page
- `services.html` — service detail
- `about.html` — profile and approach
- `contact.html` — project enquiry

The landing Hero presents the original ELTONEX wordmark and “Build what’s next.” against the original Gold Horizon film. The exact rocket mark is a graphite and gold sculpture hovering above a dark landscape, with a warm horizon, material reflections and a grounding shadow. `assets/hero-cinematic.mp4` is a silent 12-second loop; `assets/hero-cinematic-poster.jpg` provides the still fallback. The film is authored CGI, not live-action footage. Its editable HyperFrames source and rendering notes live in `media/hero-film/`.

`hero-film.js` loads the video only when the section is visible and motion is allowed. It pauses offscreen or in a background tab. Reduced-motion and Save-Data visitors see the poster without downloading the video. Autoplay failures also preserve the poster. The local preview server supports video MIME types and byte-range requests.

The complete scene, including the rocket, is rendered into the video. The website does not load a Three.js renderer or require WebGL. Portrait screens reframe the sculpture above the copy; wide screens pair the slogan on the left with the sculpture on the right. `hero.css` isolates this first-section treatment from the rest of the site.

The short introduction types once, then stays readable. Its layout and screen-reader copy remain stable, and reduced motion displays the full text immediately. The timing is inspired by [React Bits Text Type](https://reactbits.dev/text-animations/text-type), implemented with native JavaScript for this static site.

The Hero's composition and restrained hovering motion reference [Opo Finance by ALEX BENDER / FANCY](https://dribbble.com/shots/27285977-Opo-Finance-landing-page-web-design-hero-section-3D-Animation). Its footage and assets are not reused. The original ELTONEX mark, black and gold palette, landscape and video retain the site's own identity.

The contact form is intentionally a preview interaction and does not send data yet.

`layout.css` supplies the shared responsive content layouts. Service introductions and details reflow with their available width; the two project examples share one grid, image proportion and metadata structure. Decorative section, menu, process and form counters have been removed. `services.css` supplies the Service page catalogue and AUD pricing layout. `services.js` progressively enhances five service categories into accessible Basic / Standard / Advanced package tabs with direct anchor links and browser history support; all packages remain readable without JavaScript. 3D product films and ongoing support have separate sections. Package enquiries link to the existing contact page; its form remains a preview interaction.

The capability strip contains four source items. `capability-ticker.js` measures a circular belt and only mirrors fragments crossing an edge; it never places a second complete set in view. `capability-ticker.css` supplies a wrapping, readable fallback for reduced motion and no JavaScript. The animation pauses outside the viewport and in background tabs.
