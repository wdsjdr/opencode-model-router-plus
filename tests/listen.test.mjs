import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listenToAudio } from "../src/router/listen.ts";

test("whole audio and slices are model-ready and preserve stereo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "listen-test-"));
  try {
    const input = join(dir, "input.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "2", input]);
    for (const [start, duration, expected] of [[undefined, undefined, 3], [1, 1, 1]]) {
      const result = await listenToAudio(input, start, duration);
      assert.match(result.attachments[0].url, /^data:audio\/mpeg;base64,/);
      const output = join(dir, `output-${expected}.mp3`);
      writeFileSync(output, Buffer.from(result.attachments[0].url.split(",")[1], "base64"));
      const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=channels,duration", "-of", "json", output], { encoding: "utf8" }));
      assert.equal(info.streams[0].channels, 2);
      assert.ok(Math.abs(Number(info.streams[0].duration) - expected) < 0.15);
      if (start !== undefined) assert.match(result.output, /add the start offset/);
    }
    await assert.rejects(listenToAudio(input, -1), /start/);
    await assert.rejects(listenToAudio(input, 0, 0), /duration/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
