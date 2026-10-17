import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackMaster, fallbackVariants } from "../apps/worker/dist/fallback.js";

test("creates a 1080p, 720p and 480p ladder without upscaling", () => {
  assert.deepEqual(fallbackVariants(1920, 1080).map((variant) => variant.name), ["1080p", "720p", "480p"]);
  assert.deepEqual(fallbackVariants(1280, 720).map((variant) => variant.name), ["720p", "480p"]);
  assert.deepEqual(fallbackVariants(640, 360).map((variant) => variant.name), ["360p"]);
});

test("builds an adaptive master while preserving public audio and subtitle groups", () => {
  const source = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/pt.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="subs/pt.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,CODECS="hvc1.1.6.L123.B0,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"',
    "video.m3u8",
  ].join("\n");
  const master = buildFallbackMaster(source, "/media/publications/test/media", fallbackVariants(1920, 1080));
  assert.match(master, /RESOLUTION=1920x1080/);
  assert.match(master, /RESOLUTION=1280x720/);
  assert.match(master, /RESOLUTION=854x480/);
  assert.match(master, /URI="\/media\/publications\/test\/media\/audio\/pt\.m3u8"/);
  assert.match(master, /1080p\/video\.m3u8/);
  assert.match(master, /CODECS="avc1\.64002A,mp4a\.40\.2"/);
});
