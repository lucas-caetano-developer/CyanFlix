export type FallbackVariant = {
  name: string;
  width: number;
  height: number;
  bitrateKbps: number;
  maxRateKbps: number;
  bufferKbps: number;
  level: string;
  codec: string;
};

export function fallbackVariants(sourceWidth: number, sourceHeight: number): FallbackVariant[] {
  const configured: FallbackVariant[] = [
    { name: "1080p", width: 1920, height: 1080, bitrateKbps: 5000, maxRateKbps: 5350, bufferKbps: 7500, level: "4.2", codec: "avc1.64002A" },
    { name: "720p", width: 1280, height: 720, bitrateKbps: 2800, maxRateKbps: 2996, bufferKbps: 4200, level: "4.0", codec: "avc1.640028" },
    { name: "480p", width: 854, height: 480, bitrateKbps: 1400, maxRateKbps: 1498, bufferKbps: 2100, level: "3.1", codec: "avc1.64001F" },
  ];
  const available = configured.filter((variant) => variant.height <= sourceHeight + 8);
  if (available.length) return available.map((variant) => ({ ...variant, width: Math.max(2, Math.round(sourceWidth * variant.height / sourceHeight / 2) * 2) }));
  const height = Math.max(2, Math.floor(sourceHeight / 2) * 2);
  const width = Math.max(2, Math.floor(sourceWidth / 2) * 2);
  return [{ name: `${height}p`, width, height, bitrateKbps: 900, maxRateKbps: 963, bufferKbps: 1350, level: "3.1", codec: "avc1.64001F" }];
}

export function buildFallbackMaster(sourceMaster: string, sourcePublic: string, variants: FallbackVariant[]): string {
  const mediaLines = sourceMaster.split(/\r?\n/).filter((line) => line.startsWith("#EXT-X-MEDIA:") && (line.includes("TYPE=AUDIO") || line.includes("TYPE=SUBTITLES"))).map((line) =>
    line.replace(/URI="([^"]+)"/, (_match, uri: string) => `URI="${resolvePublicUri(sourcePublic, uri)}"`));
  const streamLine = sourceMaster.split(/\r?\n/).find((line) => line.startsWith("#EXT-X-STREAM-INF:")) ?? "#EXT-X-STREAM-INF:BANDWIDTH=8000000";
  const audio = streamLine.match(/AUDIO="([^"]+)"/)?.[0];
  const subtitles = streamLine.match(/SUBTITLES="([^"]+)"/)?.[0];
  const auxiliaryCodecs = (streamLine.match(/CODECS="([^"]+)"/)?.[1] ?? "").split(",").map((codec) => codec.trim()).filter((codec) => codec && !/^(?:hvc1|hev1|hevc|h265|avc1)/i.test(codec));
  const variantLines = variants.flatMap((variant) => {
    const attributes = [
      `BANDWIDTH=${variant.maxRateKbps * 1000}`,
      `AVERAGE-BANDWIDTH=${variant.bitrateKbps * 1000}`,
      `RESOLUTION=${variant.width}x${variant.height}`,
      `CODECS="${[variant.codec, ...auxiliaryCodecs].join(",")}"`, audio, subtitles,
    ].filter(Boolean).join(",");
    return [`#EXT-X-STREAM-INF:${attributes}`, `${variant.name}/video.m3u8`];
  });
  return ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS", ...mediaLines, ...variantLines, ""].join("\n");
}

function resolvePublicUri(base: string, uri: string): string {
  if (/^https?:\/\//.test(uri) || uri.startsWith("/")) return uri;
  return `${base}/${uri}`.replace(/\/\.\//g, "/");
}
