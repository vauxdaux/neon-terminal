# NEON Companion for Windows

## Download and run

1. Open the repository's **Actions > Build Windows companion**.
2. Open the most recent successful run and download **NEON-Companion-Windows-x64** under Artifacts. GitHub may require sign-in for artifact downloads.
3. Extract the artifact ZIP, then extract the inner `NEON-Companion-Windows-x64.zip`.
4. Keep `NEON-Companion.exe` beside its `wwwroot` folder. Double-click the executable. No Python, separate .NET runtime, installer or administrator account is needed.
5. A local NEON page opens in your default browser. Choose **audio > Windows companion** to start capture. To use Firefox, Chrome or Edge, paste the private launch link from the console into that browser on the same computer.
6. Play music through the computer's current default sound output, including headphones. NEON's spectrum and artwork brightness respond to that audio.
7. The current player’s cover, song details and timeline appear automatically when supplied by Windows. Use play/pause, previous/next, or drag the timeline to seek when the source player supports those actions.
8. Use **stop audio** to disconnect, or close the console window to quit.

The first build is a Windows x64 test build. Windows ARM, macOS, iOS and Android companions are not included. Safari cannot be tested on Windows; use microphone/file mode on Apple devices. This is not a promise that every browser/device combination works.

## What it reads

The companion captures the mix playing on the default Windows multimedia output. It may include notifications and sound from other apps. It begins capture only after a locally paired NEON page connects. It stops when that page disconnects. If you switch your output device, stop and reconnect.

Track title, artist, album, player name, artwork, playback status, position and duration are read from the current Windows media session when supplied by the player. This is not audio fingerprint recognition. The spectrum follows the full default-output mix; metadata and controls follow the current Windows media session, which can belong to a different app.

Available covers are rendered as ASCII or dots automatically. An uploaded cover overrides automatic artwork until **lib > use player cover** is enabled again. If the player supplies no usable cover, NEON labels the demo placeholder. Cover data stays on the PC.

Play/pause, previous/next and seeking target the displayed media session. Buttons are disabled for unsupported actions. Commands are acknowledged and the UI follows the player’s reported state rather than pretending a command succeeded. A source/track change invalidates old commands. Exact browser tab URLs and local file paths are not exposed by Windows media controls; the display shows the player name instead.

The spectrum and input level are real. Musical BPM and key are not inferred, and are marked unavailable for live inputs. Song recognition through a remote service is not implemented.

## Privacy and connection

The server listens only at `127.0.0.1:8765`. It serves the bundled web interface so browser restrictions on HTTPS-to-localhost connections do not block audio. The public GitHub Pages interface is not used for companion capture.

A random pairing key is generated at launch and placed in the URL fragment. The browser supplies it as the initial local WebSocket message. Exact Host and Origin checks restrict browser access. Do not share the private launch link. The key is replaced each time the companion starts.

Spectrum measurements, available cover images, track metadata and playback state are sent to the paired local page. Your play/pause, previous/next and seek commands return through that authenticated local connection. Raw audio is not saved to disk or uploaded. The program makes no recognition requests. It does not change firewall rules or install background services. An ordinary local process with your account access can still inspect local data; this is not a defence against malware already running as you.

The executable is unsigned. If Windows or antivirus flags the download, stop and review the detection; do not disable protection. Build verification does not establish that every endpoint-protection product will accept an unsigned new binary.

## Version 0.3.0

Adds automatic Windows player artwork, source-player labels, a playback timeline, play/pause, previous/next and seeking where supported. The startup fix from 0.2.1 is retained. Close the older companion before opening this version.

## Version 0.2.1

Fixes the local homepage returning 404. Download the latest successful build, close the old companion, fully extract the new ZIP into a new folder, and run its executable. Do not copy only the executable out of its folder.

Each downloadable build is now extracted and launched in CI. Checks require successful responses for the homepage, audio adapter and both cover assets, verify that unknown paths return 404, and reject requests from unrelated browser origins. These checks do not test real audio hardware.

## Troubleshooting

- **Page did not open:** copy the private link printed in the companion console into a desktop browser on the same computer.
- **Cannot connect:** use that local link, not the public GitHub Pages page. Keep the console open. Another copy of NEON may already occupy port 8765.
- **No movement:** make sure music is playing through the default multimedia output; stop and reconnect after changing sound devices. Protected content may not be available to capture.
- **No song details or artwork:** the player must publish a Windows media session and a cover thumbnail. Start playback and check the Windows media overlay. Use an uploaded cover if no thumbnail is supplied.
- **Controls disabled:** that action is not exposed by the current media session. In a browser, ensure the music tab is actively playing.
- **Song changed message:** wait for the display to refresh before sending another command.
- **Wrong player shown:** Windows chooses its current media session. Pause other media apps and start playback in the intended player.
- **Unsupported file format:** file mode depends on the codecs supported by the browser; try MP3 or WAV.

## Build from source

Install the .NET 10 SDK on Windows, copy `index.html`, `js/` and `assets/` into `companion/wwwroot/`, then run:

```powershell
dotnet publish companion/NEON-Companion.csproj -c Release -r win-x64 --self-contained true -o out/NEON-Companion
```

The GitHub Actions workflow does these steps and packages a ready-to-extract ZIP.



## Sensitivity, facts and lyrics (0.4.0)

The sensitivity slider scales the spectrum, ASCII brightness response, dot pulse and signal meter from 0% to 300%, without changing audio volume. The selected value is saved in the browser. Reduced motion and the existing motion setting still apply.

The side panel opens on facts. Known Windows track metadata automatically requests song/artist introductions from Wikipedia and lyrics from LRCLIB. Source links are shown. Timed lyrics follow player position, including pauses, seeks and track changes; plain lyrics are shown when timestamps are absent. A matching entry is not guaranteed. Use facts > identify manually / edit lookup for unidentified microphone/tab audio or to correct a lookup. Those inputs have no player timeline, so lyrics are readable but cannot follow playback.

Artist/title/album/duration are sent to the lookup services through the paired companion, never raw audio. Turn off lib > online facts + lyrics to stop requests. Refresh sources retries a lookup. Install the new companion package to receive the updated local interface.

## Version 0.4.1

Fixes lookup reliability: requests go through the local companion to fixed Wikipedia/LRCLIB/Lyrics.ovh endpoints, with pairing required, bounded responses and timeouts. Facts load independently of lyrics. Wikipedia requests all candidate extracts. Lyrics can match remastered titles and show plain text if the available recording has a different duration. The display shows the lookup query and specific connection errors. Hosted GitHub Pages continues to request providers directly.

Lyrics.ovh provides plain lyrics as a fallback when LRCLIB fails or has no matching entry. Both services may be unavailable or lack a song; the display reports errors rather than fabricating lyrics.
