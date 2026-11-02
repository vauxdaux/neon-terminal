using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Windows.Media.Control;

const string origin = "http://127.0.0.1:8765";
var pairToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
var requiredFiles = new[] { "index.html", "js/audio-engine.js", "assets/after-hours.svg", "assets/electric-garden.svg" };
var missing = requiredFiles.Where(file => !File.Exists(Path.Combine(webRoot, file))).ToArray();
if (missing.Length > 0) {
    Console.Error.WriteLine("NEON's web interface files are missing: " + string.Join(", ", missing));
    Console.Error.WriteLine("Fully extract the download and keep the wwwroot folder beside NEON-Companion.exe.");
    Console.WriteLine("Press Enter to close.");
    Console.ReadLine();
    Environment.ExitCode = 1;
    return;
}
var noBrowser = args.Contains("--no-browser", StringComparer.OrdinalIgnoreCase);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions {
    Args = args.Where(arg => !arg.Equals("--no-browser", StringComparison.OrdinalIgnoreCase)).ToArray(), ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = webRoot
});
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 8765));
var app = builder.Build();
app.Use(async (context, next) => {
    // Loopback binding + exact Host and Origin checks prevent remote exposure and DNS rebinding.
    if (context.Request.Host.Value != "127.0.0.1:8765" ||
        (context.Request.Headers.Origin.Count > 0 && context.Request.Headers.Origin != origin)) {
        context.Response.StatusCode = 403; return;
    }
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Cache-Control"] = "no-store";
    await next();
});
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });
app.Map("/api/live", async context => {
    if (!context.WebSockets.IsWebSocketRequest || context.Request.Headers.Origin != origin) {
        context.Response.StatusCode = 403; return;
    }
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    using var stop = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    try {
        // The random pairing key comes from the launch URL fragment, not an HTTP query.
        using var authTimeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
        authTimeout.CancelAfter(TimeSpan.FromSeconds(5));
        var buffer = new byte[1024];
        var auth = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), authTimeout.Token);
        if (auth.MessageType != WebSocketMessageType.Text || !auth.EndOfMessage) return;
        using var json = JsonDocument.Parse(buffer.AsMemory(0, auth.Count));
        if (!json.RootElement.TryGetProperty("token", out var tokenValue)) return;
        var supplied = Encoding.UTF8.GetBytes(tokenValue.GetString() ?? "");
        if (!CryptographicOperations.FixedTimeEquals(supplied, Encoding.UTF8.GetBytes(pairToken))) return;
        using var audio = new LoopbackEngine();
        audio.Start();
        await Send(socket, new { type = "ready", device = audio.DeviceName }, stop.Token);
        GlobalSystemMediaTransportControlsSessionManager? manager = null;
        try { manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync(); } catch { /* Metadata optional. */ }
        var receive = WatchDisconnect(socket, stop);
        long frameNumber = 0;
        var lastTrack = "";
        while (!stop.IsCancellationRequested && socket.State == WebSocketState.Open) {
            if (audio.Error is not null) throw new InvalidOperationException(audio.Error);
            var frame = audio.Snapshot();
            await Send(socket, new { type = "spectrum", bands = frame.Bands, rms = frame.Rms }, stop.Token);
            if (frameNumber++ % 40 == 0) {
                string title = "Listening to computer audio", artist = "Track details unavailable", album = "";
                if (manager?.GetCurrentSession() is { } session) {
                    try {
                        var properties = await session.TryGetMediaPropertiesAsync();
                        title = string.IsNullOrWhiteSpace(properties.Title) ? title : properties.Title;
                        artist = properties.Artist ?? ""; album = properties.AlbumTitle ?? "";
                    } catch { /* Keep input active if the media app has no session. */ }
                }
                var track = title + "\n" + artist + "\n" + album;
                if (track != lastTrack) {
                    await Send(socket, new { type = "metadata", title, artist, album }, stop.Token);
                    lastTrack = track;
                }
            }
            await Task.Delay(50, stop.Token);
        }
        stop.Cancel();
        try { await receive; } catch (OperationCanceledException) { }
    } catch (OperationCanceledException) { }
      catch (WebSocketException) { }
      catch (Exception error) {
        if (socket.State == WebSocketState.Open) {
            try { await Send(socket, new { type = "error", message = "Audio capture failed: " + error.Message }, CancellationToken.None); } catch { }
        }
    } finally {
        stop.Cancel();
        if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived) {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Stopped", timeout.Token); } catch { }
        }
    }
});
// An endpoint-based catch-all 404 would prevent StaticFileMiddleware from serving assets.
// Give the homepage an explicit file response and let unmatched routes return the default 404.
app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(webRoot) });
app.MapGet("/", () => Results.File(Path.Combine(webRoot, "index.html"), "text/html; charset=utf-8"));
try {
    await app.StartAsync();
    var link = origin + "/#pair=" + pairToken;
    Console.WriteLine("NEON Companion 0.2.1 | Windows computer audio");
    Console.WriteLine("Open NEON, choose audio > Windows companion to start listening.");
    Console.WriteLine("No sound is saved or sent to the internet. Keep this window open.");
    Console.WriteLine("Stop audio in NEON, or press Ctrl+C here to quit.\n");
    Console.WriteLine("Private launch link (do not share):\n" + link);
    try { if (!noBrowser) Process.Start(new ProcessStartInfo(link) { UseShellExecute = true }); }
    catch { Console.WriteLine("Open the private launch link in your preferred browser."); }
    await app.WaitForShutdownAsync();
} catch (Exception error) {
    Console.Error.WriteLine("NEON could not start: " + error.Message);
    Console.Error.WriteLine("Check that another NEON Companion is not already running on port 8765.");
    Console.WriteLine("Press Enter to close."); Console.ReadLine();
    Environment.ExitCode = 1;
}

static async Task Send(WebSocket socket, object value, CancellationToken cancellation) {
    var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
    await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellation);
}
static async Task WatchDisconnect(WebSocket socket, CancellationTokenSource stop) {
    var buffer = new byte[128];
    try {
        while (!stop.IsCancellationRequested && socket.State == WebSocketState.Open) {
            var message = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), stop.Token);
            if (message.MessageType == WebSocketMessageType.Close) break;
        }
    } catch (OperationCanceledException) { } catch (WebSocketException) { }
    finally { stop.Cancel(); }
}
