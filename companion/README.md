# NEON Companion for Windows

## Download and run

1. Open the repository's **Actions > Build Windows companion**.
2. Open the most recent successful run and download **NEON-Companion-Windows-x64** under Artifacts. GitHub may require sign-in for artifact downloads.
3. Extract the artifact ZIP, then extract the inner `NEON-Companion-Windows-x64.zip`.
4. Keep `NEON-Companion.exe` beside its `wwwroot` folder. Double-click the executable. No Python, separate .NET runtime, installer or administrator account is needed.
5. A local NEON page opens in your default browser. Choose **audio > Windows companion** to start capture. To use Firefox, Chrome or Edge, paste the private launch link from the console into that browser on the same computer.
6. Play music through the computer's current default sound output, including headphones. NEON's spectrum and artwork brightness respond to that audio.
7. Use **stop audio** to disconnect, or close the console window to quit.

The first build is a Windows x64 test build. Windows ARM, macOS, iOS and Android companions are not included. Safari cannot be tested on Windows; use microphone/file mode on Apple devices. This is not a promise that every browser/device combination works.

## What it reads

The companion captures the mix playing on the default Windows multimedia output. It may include notifications and sound from other apps. It begins capture only after a locally paired NEON page connects. It stops when that page disconnects. If you switch your output device, stop and reconnect.

Track title, artist and album are read from Windows media controls when the source app provides them. This is not audio fingerprint recognition and can be missing or describe another active media session. This version does not fetch automatic covers. Upload your chosen cover in **lib**; ASCII and dots remain available.

The spectrum and input level are real. Musical BPM and key are not inferred, and are marked unavailable for live inputs. Song recognition through a remote service is not implemented.

## Privacy and connection

The server listens only at `127.0.0.1:8765`. It serves the bundled web interface so browser restrictions on HTTPS-to-localhost connections do not block audio. The public GitHub Pages interface is not used for companion capture.

A random pairing key is generated at launch and placed in the URL fragment. The browser supplies it as the initial local WebSocket message. Exact Host and Origin checks restrict browser access. Do not share the private launch link. The key is replaced each time the companion starts.

Only spectrum measurements and Windows track metadata are sent to the paired local page. Raw audio is not saved to disk or uploaded. The program makes no recognition requests. It does not change firewall rules or install background services. An ordinary local process with your account access can still inspect local data; this is not a defence against malware already running as you.

The executable is unsigned. If Windows or antivirus flags the download, stop and review the detection; do not disable protection. Build verification does not establish that every endpoint-protection product will accept an unsigned new binary.

## Version 0.2.1

Fixes the local homepage returning 404. Download the latest successful build, close the old companion, fully extract the new ZIP into a new folder, and run its executable. Do not copy only the executable out of its folder.

Each downloadable build is now extracted and launched in CI. Checks require successful responses for the homepage, audio adapter and both cover assets, verify that unknown paths return 404, and reject requests from unrelated browser origins. These checks do not test real audio hardware.

## Troubleshooting

- **Page did not open:** copy the private link printed in the companion console into a desktop browser on the same computer.
- **Cannot connect:** use that local link, not the public GitHub Pages page. Keep the console open. Another copy of NEON may already occupy port 8765.
- **No movement:** make sure music is playing through the default multimedia output; stop and reconnect after changing sound devices. Protected content may not be available to capture.
- **No song details:** the player must publish a Windows media session. Use manual artwork until its metadata is available.
- **Unsupported file format:** file mode depends on the codecs supported by the browser; try MP3 or WAV.

## Build from source

Install the .NET 10 SDK on Windows, copy `index.html`, `js/` and `assets/` into `companion/wwwroot/`, then run:

```powershell
dotnet publish companion/NEON-Companion.csproj -c Release -r win-x64 --self-contained true -o out/NEON-Companion
```

The GitHub Actions workflow does these steps and packages a ready-to-extract ZIP.
