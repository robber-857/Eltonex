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

The landing Hero uses the local `assets/hero-loop.webm` motion background, with `assets/hero-poster.png` as its static fallback. The motion can be paused from the Hero control and is disabled automatically when reduced motion is preferred.

The contact form is intentionally a preview interaction and does not send data yet.
