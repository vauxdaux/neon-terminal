using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;

// Fixed providers only. Pairing and existing Host/Origin checks also apply to metadata lookups.
public sealed class LookupProxy : IDisposable {
    private readonly string token;
    private readonly HttpClient client = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(8) };
    private readonly SemaphoreSlim slots = new(4);
    private readonly ConcurrentDictionary<string, (DateTime expires, byte[] body)> cache = new();
    public LookupProxy(string pairToken) {
        token = pairToken;
        client.DefaultRequestHeaders.UserAgent.ParseAdd("NEON-Terminal/0.4.1 (+https://github.com/vauxdaux/neon-terminal)");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
    }
    public async Task Handle(HttpContext context) {
        var supplied = context.Request.Headers["X-NEON-Pair"].ToString();
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(token))) { context.Response.StatusCode = 403; return; }
        var service = context.Request.RouteValues["service"]?.ToString();
        string? target = service switch { "wiki" => "https://en.wikipedia.org/w/api.php", "lyrics-search" => "https://lrclib.net/api/search", "lyrics-get" => "https://lrclib.net/api/get", "lyrics-fallback" => "https://api.lyrics.ovh/v1/", _ => null };
        if (target == null) { context.Response.StatusCode = 404; return; }
        var allowed = service == "wiki" ? new[] { "action", "prop", "titles", "redirects", "exintro", "explaintext", "exsentences", "exlimit", "inprop", "format", "formatversion", "origin" } : new[] { "artist_name", "track_name", "album_name", "duration" };
        if (context.Request.Query.Count > 16 || context.Request.Query.Any(pair => !allowed.Contains(pair.Key) || pair.Value.Count != 1 || pair.Value.ToString().Length > 1000) ||
            (service == "wiki" && context.Request.Query["action"] != "query")) { context.Response.StatusCode = 400; return; }
        var query = string.Join("&", context.Request.Query.Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value.ToString())));
        var url = target + "?" + query;
        if (service == "lyrics-fallback") {
            var artist = context.Request.Query["artist_name"].ToString();var title = context.Request.Query["track_name"].ToString();
            if (string.IsNullOrWhiteSpace(artist) || string.IsNullOrWhiteSpace(title) || artist.Length > 200 || title.Length > 200) { context.Response.StatusCode = 400; return; }
            url = target + Uri.EscapeDataString(artist) + "/" + Uri.EscapeDataString(title);
        }
        context.Response.ContentType = "application/json; charset=utf-8";
        if (cache.TryGetValue(url, out var hit) && hit.expires > DateTime.UtcNow) { await context.Response.Body.WriteAsync(hit.body, context.RequestAborted); return; }
        if (!await slots.WaitAsync(200, context.RequestAborted)) { context.Response.StatusCode = 429; return; }
        try {
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
            context.Response.StatusCode = (int)response.StatusCode;
            if (response.StatusCode == HttpStatusCode.NotFound) return;
            if (!response.IsSuccessStatusCode) { await context.Response.WriteAsync("{\"error\":{\"message\":\"Lookup provider returned HTTP " + (int)response.StatusCode + ".\"}}"); return; }
            // Bound streaming responses even when upstream does not supply Content-Length.
            using var stream = await response.Content.ReadAsStreamAsync(context.RequestAborted);
            using var buffer = new MemoryStream();
            var bytes = new byte[16384];int count;
            while ((count = await stream.ReadAsync(bytes, context.RequestAborted)) > 0) {
                if (buffer.Length + count > 2097152) { context.Response.StatusCode = 502; return; }
                buffer.Write(bytes, 0, count);
            }
            var body = buffer.ToArray();
            using var json = System.Text.Json.JsonDocument.Parse(body);
            if (cache.Count >= 128) cache.Clear();
            cache[url] = (DateTime.UtcNow.AddMinutes(1), body);
            await context.Response.Body.WriteAsync(body, context.RequestAborted);
        } catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested) {
            context.Response.StatusCode = 504;await context.Response.WriteAsync("{\"error\":{\"message\":\"Lookup provider timed out.\"}}");
        } catch (Exception) when (!context.RequestAborted.IsCancellationRequested) {
            context.Response.StatusCode = 502;await context.Response.WriteAsync("{\"error\":{\"message\":\"Companion could not reach the lookup provider.\"}}");
        } finally { slots.Release(); }
    }
    public void Dispose() { client.Dispose(); slots.Dispose(); }
}
