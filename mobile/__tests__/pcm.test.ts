import {
  base64ToBytes,
  base64ToFloat32,
  bytesToBase64,
  floatToPcm16Base64,
  fmtTime,
  mergeFloat32,
  pcm16ToWavBytes,
} from "../src/audio/pcm";

describe("base64 round-trip", () => {
  it("encodes and decodes arbitrary bytes", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 100, 1601]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) % 256;
      const decoded = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it("matches Node's Buffer base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("PCM16 conversion", () => {
  it("round-trips float samples within quantization error", () => {
    const input = new Float32Array([0, 0.5, -0.5, 0.999, -0.999, 0.123, -0.321]);
    const b64 = floatToPcm16Base64(input);
    const output = base64ToFloat32(b64);
    expect(output.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      // Int16 conversion truncates, so worst-case error is ~2 LSB.
      expect(Math.abs(output[i] - input[i])).toBeLessThan(2 / 32768);
    }
  });

  it("clamps out-of-range samples", () => {
    const out = base64ToFloat32(floatToPcm16Base64(new Float32Array([2, -2])));
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(-1, 3);
  });

  it("produces little-endian PCM16 (protocol contract)", () => {
    // +1.0 → 0x7FFF little-endian → bytes [0xFF, 0x7F]
    const bytes = base64ToBytes(floatToPcm16Base64(new Float32Array([1])));
    expect(Array.from(bytes)).toEqual([0xff, 0x7f]);
  });
});

describe("mergeFloat32", () => {
  it("concatenates queued mic frames", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([3]);
    const merged = mergeFloat32([a, b], 3);
    expect(Array.from(merged)).toEqual([1, 2, 3]);
  });
});

describe("pcm16ToWavBytes", () => {
  it("writes a valid 44-byte WAV header", () => {
    const samples = new Int16Array([0, 1000, -1000]);
    const wav = pcm16ToWavBytes(samples, 16000);
    expect(wav.length).toBe(44 + 6);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // bit depth
  });
});

describe("fmtTime", () => {
  it("formats mm:ss", () => {
    expect(fmtTime(0)).toBe("00:00");
    expect(fmtTime(61)).toBe("01:01");
    expect(fmtTime(3599)).toBe("59:59");
  });
});
