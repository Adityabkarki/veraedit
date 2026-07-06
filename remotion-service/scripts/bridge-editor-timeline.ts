/**
 * CLI: read editor timeline JSON from stdin → print bridged DirectorTimeline JSON.
 */
import { bridgeEditorTimelineToDirector } from "../src/lib/director/legacyTimelineBridge";

async function main() {
  const raw = await new Promise<string>((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { buf += c; });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });

  const body = JSON.parse(raw || "{}");
  const timeline = bridgeEditorTimelineToDirector(body.timeline ?? body, {
    projectId: body.projectId ?? "bridge",
    fps: body.fps,
    width: body.width,
    height: body.height,
    contentType: body.contentType,
    theme: body.theme,
  });

  process.stdout.write(JSON.stringify({ success: true, timeline }));
}

main();
