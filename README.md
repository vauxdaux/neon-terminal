# NEON music terminal

A browser music display that renders artwork as ASCII characters or halftone dots, with terminal colours, live audio visualisation and a Windows companion.

[Open the web app](https://vauxdaux.github.io/neon-terminal/)

## Audio inputs

Open **audio** in the top bar:

| Input | Works with | Behaviour |
| --- | --- | --- |
| Windows companion | Windows x64, using a modern desktop browser | Reads default-output computer audio, including headphone playback, through a local companion. Artwork, player name, timeline and supported playback controls come from Windows media controls. |
| Microphone | Browsers that support microphone access over HTTPS or localhost | Visualises audible music. Requires permission; cannot hear sound confined to headphones. |
| Shared tab | Browsers offering audio with screen/tab sharing | Choose the music tab and enable tab audio. Other browsers use another input. |
| Audio file | Modern browsers, with supported file codecs | Plays a local file and visualises it without an upload. |

There is no universal browser-only tab capture method. The Windows companion supplies audio independently of the browser by opening its own local interface. It does not make iPhone/Android system capture possible.

[Download/setup instructions for Windows Companion](companion/README.md)

## Artwork and controls

- **sensitivity** adjusts spectrum height, ASCII brightness response, dot pulse and the signal meter together, from 0% to 300%. It is saved in this browser and does not change listening volume.
- **facts / lyrics / code** switches the side panel. Known tracks automatically look up sourced song and artist introductions on Wikipedia and lyrics on LRCLIB. Timed lyrics follow the Windows player or local file timeline; plain lyrics remain readable when timestamps are unavailable.
- **facts > identify manually / edit lookup** lets you enter a song and artist when the input does not identify them. It changes the information lookup, not the player metadata or artwork.
- **lib > online facts + lyrics** turns online lookups off or on.
- **ascii / dots** changes the cover rendering.
- **pink** cycles through pink, green, amber and ice.
- **show** toggles artwork-only mode.
- **lib** opens the demo library, search, cover image upload, glow and motion settings.
- **audio** chooses a real input. **stop audio** releases it and returns to demo mode.
- **F** toggles fullscreen where supported.
- **Space / play / pause** controls the Windows player in companion mode, pauses a local audio file in file mode, or freezes visuals in microphone/tab mode. Use **stop audio** to release capture.
- The companion timeline shows the real track position and duration. Drag it to seek where the player allows it. Previous/next buttons follow the player’s capabilities. Local files can also seek; microphone/tab inputs have no track controls.
- **lib > use player cover** uses Windows album artwork automatically. Upload a cover to override it; enable the checkbox to return to player artwork. Missing covers use a labelled demo placeholder.

Remote song recognition and online artwork lookup are not connected. The companion reads the artwork and metadata already supplied to Windows by the active player. Microphone/tab inputs do not identify songs. Live modes do not fabricate BPM, key or artist facts. Wikipedia and LRCLIB may lack a matching entry, be temporarily unavailable or provide a different timing version; the display shows the source or an unavailable message. Microphone/tab audio cannot supply a playback timeline for lyric following. Demo metadata is fictional and labelled as such.

Uploaded cover images remain in the page session and are processed locally. Original SVG demo artwork is included. Use images you have permission to use. No Golden source code, commercial album artwork, private files or credentials are bundled. A future Spotify integration would still need to follow its content rules.

## Privacy

Audio is analysed locally. This version does not record raw audio to disk or send it to any recognition service. The companion sends spectrum levels, available album artwork, playback state and Windows song metadata to its paired localhost page. User playback commands return over the same paired local connection. Online facts and lyrics send artist, title, album and duration to Wikipedia and LRCLIB directly from the browser; no audio is sent. Disable this in lib. Details are cached in page memory for up to an hour, with a refresh button to retry. Selected colour theme, sensitivity and lookup preference use local storage; the local pairing key uses session storage. Hosting services may keep their normal access logs. See the companion README for connection details and limitations.

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
node --test tests/*.test.cjs
```

**Actions > Build Windows companion** builds a self-contained executable and bundles the web interface. This build requires .NET 10 and NAudio 2.2.1; the Windows runner supplies them. CI compiles the source, runs the audio/control tests and starts the extracted application to check the interface files. Actual audio capture and third-party player behaviour still require a test on your Windows PC.

NEON is not affiliated with Golden, Apple Music or Spotify. No open-source licence has been selected for the repository; NAudio's licence is included separately.


