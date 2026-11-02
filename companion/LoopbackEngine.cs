using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;

public sealed record SpectrumFrame(float[] Bands, float Rms);

public sealed class LoopbackEngine : IDisposable {
    private const int FftSize = 2048;
    private readonly object gate = new();
    private readonly WasapiLoopbackCapture capture;
    private readonly MMDevice device;
    private readonly float[] ring = new float[FftSize];
    private int write, samples;
    private DateTime lastAudio = DateTime.MinValue;
    private bool disposed;
    public string DeviceName => device.FriendlyName;
    public string? Error { get; private set; }

    public LoopbackEngine() {
        using var enumerator = new MMDeviceEnumerator();
        device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        capture = new WasapiLoopbackCapture(device);
        capture.DataAvailable += OnData;
        capture.RecordingStopped += (_, args) => { if (args.Exception != null) Error = args.Exception.Message; };
    }
    public void Start() => capture.StartRecording();
    private void OnData(object? sender, WaveInEventArgs args) {
        var format = capture.WaveFormat;
        bool floating = format.Encoding == WaveFormatEncoding.IeeeFloat ||
            (format is WaveFormatExtensible ext && ext.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71"));
        int bytes = format.BitsPerSample / 8, channels = format.Channels;
        if (bytes is < 2 or > 4 || channels < 1) { Error = "Unsupported output audio format. Try 16-bit or 32-bit audio in Windows sound settings."; return; }
        lock (gate) {
            if (disposed) return;
            for (int offset = 0; offset + format.BlockAlign <= args.BytesRecorded; offset += format.BlockAlign) {
                float value = 0;
                for (int channel = 0; channel < channels; channel++) {
                    int at = offset + channel * bytes;
                    if (floating && bytes == 4) value += BitConverter.ToSingle(args.Buffer, at);
                    else if (bytes == 2) value += BitConverter.ToInt16(args.Buffer, at) / 32768f;
                    else if (bytes == 3) { int pcm = args.Buffer[at] | args.Buffer[at+1] << 8 | args.Buffer[at+2] << 16; if ((pcm & 0x800000) != 0) pcm |= unchecked((int)0xff000000); value += pcm / 8388608f; }
                    else value += BitConverter.ToInt32(args.Buffer, at) / 2147483648f;
                }
                value /= channels;
                ring[write] = float.IsFinite(value) ? Math.Clamp(value, -1, 1) : 0;
                write = (write + 1) % FftSize;
                samples = Math.Min(FftSize, samples + 1);
            }
            lastAudio = DateTime.UtcNow;
        }
    }
    public SpectrumFrame Snapshot() {
        var fft = new Complex[FftSize];
        float sum = 0;
        lock (gate) {
            if (samples < FftSize || DateTime.UtcNow - lastAudio > TimeSpan.FromMilliseconds(500)) return new(new float[64], 0);
            for (int i = 0; i < FftSize; i++) {
                float value = ring[(write + i) % FftSize]; sum += value * value;
                fft[i].X = value * (float)(.5 - .5 * Math.Cos(2 * Math.PI * i / (FftSize - 1)));
            }
        }
        FastFourierTransform.FFT(true, 11, fft);
        var bands = new float[64];
        double rate = capture.WaveFormat.SampleRate, maximum = Math.Min(16000, rate / 2);
        for (int i = 0; i < bands.Length; i++) {
            int lo = Math.Max(1, (int)(35 * Math.Pow(maximum / 35, i / 64.0) * FftSize / rate));
            int hi = Math.Min(FftSize / 2, Math.Max(lo + 1, (int)Math.Ceiling(35 * Math.Pow(maximum / 35, (i + 1) / 64.0) * FftSize / rate)));
            double peak = 0;
            for (int j = lo; j < hi; j++) peak = Math.Max(peak, Math.Sqrt(fft[j].X * fft[j].X + fft[j].Y * fft[j].Y));
            // Display-only log amplitude, not an estimate of musical tempo/key.
            bands[i] = peak > .00001 ? (float)Math.Clamp((20 * Math.Log10(peak) + 85) / 75, 0, 1) : 0;
        }
        return new(bands, Math.Clamp(MathF.Sqrt(sum / FftSize) * 4, 0, 1));
    }
    public void Dispose() {
        lock (gate) { if (disposed) return; disposed = true; }
        capture.DataAvailable -= OnData;
        capture.StopRecording(); capture.Dispose(); device.Dispose();
    }
}
