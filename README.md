# NEON music terminal

A standalone browser display that renders artwork as ASCII characters or halftone dots, with terminal colours, simulated code and a text spectrum.

## Run

Open `index.html` in a modern browser, or serve this folder with:

```sh
python -m http.server 8000
```

Open http://localhost:8000. No build tools or packages are required.

## GitHub Pages

Upload the contents of this folder to your repository root. In repository Settings > Pages choose **Deploy from a branch**, select **main** and **/(root)**, then Save. GitHub shows the site URL when deployment completes.

## Controls

- **ascii / dots** switches rendering.
- **pink** cycles through pink, green, amber and ice.
- **show** toggles artwork-only mode.
- **lib** opens the demo library, search, image upload, glow and motion settings.
- **F** toggles fullscreen where the browser supports it.
- **Space** pauses or resumes the visual demo; arrow keys change demo tracks.
- Use screen mirroring or a TV browser for a larger display. Built-in casting is not implemented.

## Current scope

This is a visual prototype. It has no audio playback, Spotify integration, audio analysis or live artist lookup. Track metadata, BPM, keys and the spectrum are demonstration data. Original SVG demo covers are included; no Golden source code, commercial album artwork, credentials or private user files are bundled.

Uploaded images are processed locally in the browser and are not sent to a server by this app. Uploads last for the current page session. The selected theme is stored locally. The hosting service can keep its normal request logs.

Use images you have permission to use. If Spotify support is added later, its artwork and metadata requirements still apply regardless of hosting platform.

The UI was inspired by a retro music terminal reference. NEON is not affiliated with Golden, Apple Music or Spotify.

No open-source licence has been selected for this repository yet.
