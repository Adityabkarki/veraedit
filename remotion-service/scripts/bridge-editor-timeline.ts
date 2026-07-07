/**
 * CLI: read editor timeline JSON from stdin → print bridged DirectorTimeline JSON.
 */
import { bridgeEditorTimelineToDirector } from "../src/lib/director/legacyTimelineBridge";

type BridgeStep = "read_stdin" | "parse_json" | "bridge_timeline";

async function main() {
  let step: BridgeStep = "read_stdin";
  let projectId = "bridge";
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => {
        buf += c;
      });
      process.stdin.on("end", () => resolve(buf));
      process.stdin.on("error", reject);
    });

    step = "parse_json";
    const body = JSON.parse(raw || "{}");
    projectId = body.projectId ?? "bridge";
    const timelineInput = body.timeline ?? body;
    if (!timelineInput || typeof timelineInput !== "object") {
      throw new Error("timeline is required and must be an object");
    }

    step = "bridge_timeline";
    const timeline = bridgeEditorTimelineToDirector(timelineInput, {
      projectId,
      fps: body.fps,
      width: body.width,
      height: body.height,
      contentType: body.contentType,
      theme: body.theme,
    });

    process.stdout.write(JSON.stringify({ success: true, timeline }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `bridge-editor-timeline failed: step=${step} projectId=${projectId} error=${message}`,
      stack ?? "",
    );
    process.stdout.write(
      JSON.stringify({
        success: false,
        error: message,
        step,
        projectId,
      }),
    );
    process.exitCode = 1;
  }
}

void main();
