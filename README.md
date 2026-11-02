# NEON music terminal

A browser music display that renders artwork as ASCII characters or halftone dots, with terminal colours, live audio visualisation and a Windows companion.

[Open the web app](https://vauxdaux.github.io/neon-terminal/)

## Audio inputs

Open **audio** in the top bar:

| Input | Works with | Behaviour |
| --- | --- | --- |
| Windows companion | Windows x64, using a modern desktop browser | Reads default-output computer audio, including headphone playback, through a local companion. Optional track metadata comes from Windows media controls. |
| Microphone | Browsers that support microphone access over HTTPS or localhost | Visualises audible music. Requires permission; cannot hear sound confined to headphones. |
| Shared tab | Browsers offering audio with screen/tab sharing | Choose the music tab and enable tab audio. Other browsers use another input. |
| Audio file | Modern browsers, with supported file codecs | Plays a local file and visualises it without an upload. |

There is no universal browser-only tab capture method. The Windows companion supplies audio independently of the browser by opening its own local interface. It does not make iPhone/Android system capture possible.

[Download/setup instructions for Windows Companion](companion/README.md)

## Artwork and controls

- **ascii / dots** changes the cover rendering.
- **pink** cycles through pink, green, amber and ice.
- **show** toggles artwork-only mode.
- **lib** opens the demo library, search, cover image upload, glow and motion settings.
- **audio** chooses a real input. **stop audio** releases it and returns to demo mode.
- **F** toggles fullscreen where supported.
- **Space** pauses visuals, or pauses a local audio file. It does not pause another app or release capture; use **stop audio** for that.
- The audio-file timeline can seek. Live microphone/tab/companion inputs have no seek or demo-track controls.

Song recognition services and automatic cover lookup are not connected. Microphone/tab inputs do not identify songs; the companion reads metadata only when supplied by Windows. Live modes do not fabricate BPM, key or artist facts. Demo metadata is fictional and labelled as such.

Uploaded cover images remain in the page session and are processed locally. Original SVG demo artwork is included. Use images you have permission to use. No Golden source code, commercial album artwork, private files or credentials are bundled. A future Spotify integration would still need to follow its content rules.

## Privacy

Audio is analysed locally. This version does not record raw audio to disk or send it to any recognition service. The companion sends only spectrum levels and optional Windows song metadata to its paired localhost web page. Selected colour theme and the local pairing key use local/session storage. Hosting services may keep their normal access logs. See the companion README for connection details and limitations.

## Run the website locally

No packages or build step are required:

```sh
python -m http.server 8000
```

Open http://localhost:8000. Microphone access requires HTTPS or localhost; opening a file directly can restrict browser APIs.

## GitHub Pages

In repository **Settings > Pages**, choose **Deploy from a branch**, **main**, **/(root)**. Pushes update the site automatically.

## Checks and build

```sh
node --test tests/audio-engine.test.cjs
```

**Actions > Build Windows companion** builds a self-contained executable and bundles the web interface. This build requires .NET 10 and NAudio 2.2.1; the Windows runner supplies them. Source code compiles in CI; real Windows output-device capture still requires a hardware test.

NEON is not affiliated with Golden, Apple Music or Spotify. No open-source licence has been selected for the repository; NAudio's licence is included separately.
