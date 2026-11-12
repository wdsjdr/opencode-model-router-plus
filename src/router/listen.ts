import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * `router_listen`: hand a real audio clip to the model.
 *
 * The host turns a tool result's `attachments` into model-visible file parts
 * (`src/compat/v2-hooks.ts`), which is the only way an audio file reaches a
 * multimodal model. The tool transcodes to a small mono mp3 so token cost stays
 * proportional to the clip, and supports both "the whole file" and a slice.
 */

const DEFAULT_BITRATE = "48k";
const DEFAULT_RATE = "22050";

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ code: -1, stderr: String(error) }));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

function safeName(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "audio";
}

export interface ListenResult {
  output: string;
  attachments: Array<{ type: "file"; url: string; mime: string; filename: string }>;
}

export async function listenToAudio(
  source: string,
  start?: number,
  duration?: number,
): Promise<ListenResult> {
  const dir = mkdtempSync(join(tmpdir(), "router-listen-"));
  const stem = safeName(basename(source, extname(source)));
  const slice = start !== undefined || duration !== undefined;
  const out = join(dir, `${stem}${slice ? `-${Math.round(start ?? 0)}s` : ""}.mp3`);

  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (start !== undefined && start > 0) args.push("-ss", String(start));
  if (duration !== undefined && duration > 0) args.push("-t", String(duration));
  args.push(
    "-i", source,
    "-vn",
    "-ac", "1",
    "-ar", DEFAULT_RATE,
    "-b:a", DEFAULT_BITRATE,
    out,
  );

  const result = await run("ffmpeg", args);
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg could not decode '${source}': ${result.stderr.trim().split("\n").pop() ?? `exit ${result.code}`}`,
    );
  }

  const fileName = basename(out);
  const where = slice
    ? `slice starting at ${start ?? 0}s${duration ? ` for ${duration}s` : ""}`
    : "full file";
  return {
    output: `Attached audio (${where}): ${fileName}. Listen to it directly; do not read the source file.`,
    attachments: [{ type: "file" as const, url: pathToFileURL(out).href, mime: "audio/mpeg", filename: fileName }],
  };
}

export const LISTEN_MIME = "audio/mpeg";
