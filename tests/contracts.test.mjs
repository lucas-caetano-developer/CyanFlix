import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, manifestHash, manifestSchema } from "../packages/contracts/dist/index.js";

function validManifest() {
  const manifest = {
    schema_version: 1,
    package_id: "pkg_test",
    idempotency_key: "idem_test",
    package_type: "season",
    generated_at: "2026-10-13T00:00:00Z",
    work: { id: "work_test", content_kind: "anime", title: "Teste", original_title: null, year: 2026, provider_ids: {}, metadata: { rating: 8 } },
    season: {
      id: "season_test", number: 1, title: "Temporada 1", provider_season_number: 1,
      provider_episode_start: 1, metadata: {}, publication_completeness: {
        expected_episode_count: 1, included_episode_count: 1, included_episode_numbers: [1],
        missing_episode_count: 0, missing_episode_numbers: [], is_complete: true,
        incomplete_publication_allowed: true
      }
    },
    movie: null,
    episodes: [{
      id: "episode_test", number: 1, absolute_number: 1, title: "Episódio", metadata: {}, markers: [],
      source_sha256: "a".repeat(64), media_manifest: "episodes/episode_test/media/master.m3u8",
      subtitle_assets: [], subtitle_warnings: [], delivery: { video_codec: "hevc" }
    }],
    assets: [{
      id: "asset_test", type: "video_hls", path: "episodes/episode_test/media/master.m3u8",
      size_bytes: 12, sha256: "b".repeat(64), season_id: null, episode_id: "episode_test", metadata: {}
    }],
    delivery: { profile: "hls-fmp4", representations: 1 },
    manifest_sha256: ""
  };
  manifest.manifest_sha256 = manifestHash(manifest);
  return manifest;
}

test("accepts a sealed contract manifest", () => {
  const manifest = validManifest();
  assert.equal(manifestSchema.parse(manifest).manifest_sha256, manifest.manifest_sha256);
  assert.equal(manifestHash(manifest), manifest.manifest_sha256);
});

test("rejects duplicate paths and invalid hashes", () => {
  const manifest = validManifest();
  manifest.assets.push({ ...manifest.assets[0], id: "asset_other", sha256: "short" });
  assert.equal(manifestSchema.safeParse(manifest).success, false);
});

test("canonical JSON sorts Unicode keys deterministically", () => {
  assert.equal(canonicalJson({ z: 1, a: { "😀": 2, á: 1 } }), '{"a":{"á":1,"😀":2},"z":1}');
  assert.equal(manifestHash({ z: 1, a: { "😀": 2, á: 1 }, rating: 8 }),
    "6171825848cbd0a059d20988be16f8640cd597c1649a39b6f7fe5b389bc38b0c");
});
