using System.Text.Json;
using Windows.Media.Control;
using Windows.Storage.Streams;

/// <summary>Reads and controls only the Windows media session represented by the latest snapshot.</summary>
public sealed class MediaSessionBridge {
    private readonly GlobalSystemMediaTransportControlsSessionManager? manager;
    private GlobalSystemMediaTransportControlsSession? current;
    private string identity = "", sessionId = "", sentIdentity = "";
    private string? artwork, sentArtwork;
    private DateTime nextArtworkRead = DateTime.MinValue;
    private bool emptySent;
    private MediaSessionBridge(GlobalSystemMediaTransportControlsSessionManager? value) => manager = value;
    public static async Task<MediaSessionBridge> CreateAsync() {
        try { return new(await GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); }
        catch { return new(null); }
    }
    private static string Identity(GlobalSystemMediaTransportControlsSession session, GlobalSystemMediaTransportControlsSessionMediaProperties properties) =>
        session.SourceAppUserModelId + "\n" + properties.Title + "\n" + properties.Artist + "\n" + properties.AlbumTitle;

    public async Task<IReadOnlyList<object>> UpdatesAsync() {
        var packets = new List<object>();
        var session = manager?.GetCurrentSession();
        if (session == null) return Empty(packets);
        try {
            var properties = await session.TryGetMediaPropertiesAsync();
            var key = Identity(session, properties);
            if (key != identity || current == null) {
                identity = key; sessionId = Guid.NewGuid().ToString("N"); artwork = null;
                nextArtworkRead = DateTime.MinValue;
            }
            current = session; emptySent = false;
            if (DateTime.UtcNow >= nextArtworkRead) {
                artwork = await ReadArtwork(properties);
                nextArtworkRead = DateTime.UtcNow.AddSeconds(10);
            }
            if (sentIdentity != identity || sentArtwork != artwork) {
                packets.Add(new { type = "metadata", sessionId, title = properties.Title ?? "", artist = properties.Artist ?? "", album = properties.AlbumTitle ?? "", sourceAppId = session.SourceAppUserModelId, sourceName = PlayerName(session.SourceAppUserModelId), artwork });
                sentIdentity = identity; sentArtwork = artwork;
            }
            var playback = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();
            var controls = playback.Controls;
            bool playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            double rate = playback.PlaybackRate ?? 1;
            double start = timeline.StartTime.TotalSeconds;
            double duration = Math.Max(0, timeline.EndTime.TotalSeconds - start);
            double position = timeline.Position.TotalSeconds - start;
            if (playing && timeline.LastUpdatedTime != default) position += Math.Max(0, (DateTimeOffset.UtcNow - timeline.LastUpdatedTime).TotalSeconds) * rate;
            position = Math.Max(0, duration > 0 ? Math.Min(duration, position) : position);
            packets.Add(new { type = "playback", sessionId, available = true, playing, position, duration, rate,
                status = playback.PlaybackStatus.ToString(), sourceName = PlayerName(session.SourceAppUserModelId),
                canPlay = controls.IsPlayEnabled, canPause = controls.IsPauseEnabled, canToggle = controls.IsPlayPauseToggleEnabled,
                canNext = controls.IsNextEnabled, canPrevious = controls.IsPreviousEnabled,
                canSeek = controls.IsPlaybackPositionEnabled && duration > 0 && timeline.MaxSeekTime > timeline.MinSeekTime });
            return packets;
        } catch { return Empty(packets); }
    }
    private IReadOnlyList<object> Empty(List<object> packets) {
        current = null; identity = ""; sessionId = ""; sentIdentity = ""; artwork = null; sentArtwork = null;
        if (!emptySent) {
            packets.Add(new { type = "metadata", sessionId = "", title = "No active player", artist = "Start music in a player that supports Windows media controls", album = "", sourceName = "No player", artwork = (string?)null });
            emptySent = true;
        }
        packets.Add(new { type = "playback", sessionId = "", available = false, playing = false, position = 0, duration = 0, rate = 1, canPlay = false, canPause = false, canToggle = false, canNext = false, canPrevious = false, canSeek = false });
        return packets;
    }
    public async Task<object> ExecuteAsync(string message) {
        string id = "";
        try {
            using var json = JsonDocument.Parse(message);
            var root = json.RootElement;
            if (root.TryGetProperty("id", out var requestId) && requestId.ValueKind == JsonValueKind.String) id = requestId.GetString() ?? "";
            if (id.Length is < 1 or > 64 || !root.TryGetProperty("type", out var type) || type.GetString() != "control") return Result(id, false, "Invalid command.");
            if (!root.TryGetProperty("sessionId", out var requested) || requested.GetString() != sessionId || current == null || string.IsNullOrEmpty(sessionId)) return Result(id, false, "The player changed. Wait for the display to refresh.");
            // Revalidate the displayed track and source before acting; never blindly target a new player.
            var active = manager?.GetCurrentSession();
            if (active == null || active.SourceAppUserModelId != current.SourceAppUserModelId || Identity(active, await active.TryGetMediaPropertiesAsync()) != identity) return Result(id, false, "The player or song changed. Wait for the display to refresh.");
            var controls = current.GetPlaybackInfo().Controls;
            string action = root.GetProperty("action").GetString() ?? "";
            bool accepted;
            switch (action) {
                case "play": if (current.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) return Result(id, true, "Player is already playing."); accepted = controls.IsPlayEnabled ? await current.TryPlayAsync() : controls.IsPlayPauseToggleEnabled && await current.TryTogglePlayPauseAsync(); break;
                case "pause": if (current.GetPlaybackInfo().PlaybackStatus is GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused or GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped) return Result(id, true, "Player is already paused."); accepted = controls.IsPauseEnabled ? await current.TryPauseAsync() : controls.IsPlayPauseToggleEnabled && await current.TryTogglePlayPauseAsync(); break;
                case "toggle": accepted = controls.IsPlayPauseToggleEnabled && await current.TryTogglePlayPauseAsync(); break;
                case "next": accepted = controls.IsNextEnabled && await current.TrySkipNextAsync(); break;
                case "previous": accepted = controls.IsPreviousEnabled && await current.TrySkipPreviousAsync(); break;
                case "seek":
                    if (!controls.IsPlaybackPositionEnabled || !root.TryGetProperty("position", out var at) || !at.TryGetDouble(out var seconds) || !double.IsFinite(seconds)) return Result(id, false, "This player does not support seeking.");
                    var timeline = current.GetTimelineProperties();
                    double lo = timeline.MinSeekTime.TotalSeconds, hi = timeline.MaxSeekTime.TotalSeconds;
                    if (hi <= lo) return Result(id, false, "The seek range is unavailable.");
                    var target = Math.Clamp(timeline.StartTime.TotalSeconds + seconds, lo, hi);
                    accepted = await current.TryChangePlaybackPositionAsync(TimeSpan.FromSeconds(target).Ticks); break;
                default: return Result(id, false, "Unknown playback command.");
            }
            return Result(id, accepted, accepted ? "Command sent to the player." : "The player did not accept that command.");
        } catch { return Result(id, false, "The player is no longer available or could not accept that command."); }
    }
    private static object Result(string id, bool ok, string message) => new { type = "commandResult", id, ok, message };
    private static string PlayerName(string value) {
        var id = value.ToLowerInvariant();
        if (id.Contains("spotify")) return "Spotify";
        if (id.Contains("firefox")) return "Firefox";
        if (id.Contains("msedge") || id.Contains("microsoftedge")) return "Microsoft Edge";
        if (id.Contains("chrome")) return "Chrome";
        if (id.Contains("vlc")) return "VLC";
        if (id.Contains("applemusic")) return "Apple Music";
        return value;
    }
    private static async Task<string?> ReadArtwork(GlobalSystemMediaTransportControlsSessionMediaProperties properties) {
        if (properties.Thumbnail == null) return null;
        try {
            using var stream = await properties.Thumbnail.OpenReadAsync();
            if (stream.Size is 0 or > 2097152) return null;
            using var reader = new DataReader(stream.GetInputStreamAt(0));
            var size = (uint)stream.Size;
            if (await reader.LoadAsync(size) != size) return null;
            var bytes = new byte[size]; reader.ReadBytes(bytes);
            // Only raster image formats, with MIME inferred from bytes rather than player-supplied text.
            string? mime = bytes.Length >= 8 && bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 ? "image/png" :
                bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 ? "image/jpeg" :
                bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP" ? "image/webp" :
                bytes.Length >= 6 && (System.Text.Encoding.ASCII.GetString(bytes, 0, 6) is "GIF87a" or "GIF89a") ? "image/gif" : null;
            return mime == null ? null : "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
        } catch { return null; }
    }
}
