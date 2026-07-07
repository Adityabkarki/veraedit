const express = require("express");
const path = require("path");
const fs = require("fs");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

const PORT = Number(process.env.REMOTION_PORT || 3500);
const HOST = process.env.REMOTION_HOST || "127.0.0.1";

const app = express();
app.use(express.json({ limit: "10mb" }));

let bundleCache = null;

async function getBundle() {
  if (bundleCache) return bundleCache;

  const prebuilt = path.join(__dirname, "build", "index.html");
  if (fs.existsSync(prebuilt)) {
    bundleCache = path.join(__dirname, "build");
    console.log("Using pre-built bundle at", bundleCache);
    return bundleCache;
  }

  console.log("No pre-built bundle found, running webpack...");
  bundleCache = await bundle({
    entryPoint: path.join(__dirname, "src", "index.ts"),
    webpackOverride: (config) => config,
  });
  return bundleCache;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "viraedit-remotion" });
});

app.post("/render-captions", async (req, res) => {
  try {
    const {
      words,
      style,
      fontFamily,
      durationSeconds,
      width,
      height,
      outputPath,
      fps = 30,
    } = req.body;

    if (!outputPath) {
      return res.status(400).json({ success: false, error: "outputPath is required" });
    }

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "CaptionOverlay",
      inputProps: { words, style, fontFamily },
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.max(1, Math.ceil(durationSeconds * fps)),
        fps,
        width,
        height,
      },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: { words, style, fontFamily },
      pixelFormat: "yuva420p",
      imageFormat: "png",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    console.error("render-captions failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/render-title-card", async (req, res) => {
  try {
    const {
      text,
      startSeconds,
      endSeconds,
      fontFamily,
      brandColor,
      durationSeconds,
      width,
      height,
      outputPath,
      fps = 30,
    } = req.body;

    if (!outputPath) {
      return res.status(400).json({ success: false, error: "outputPath is required" });
    }

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "TitleCardOverlay",
      inputProps: { text, startSeconds, endSeconds, fontFamily, brandColor },
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.max(1, Math.ceil(durationSeconds * fps)),
        fps,
        width,
        height,
      },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: { text, startSeconds, endSeconds, fontFamily, brandColor },
      pixelFormat: "yuva420p",
      imageFormat: "png",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    console.error("render-title-card failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/render-lower-third", async (req, res) => {
  try {
    const {
      text,
      subtext,
      startSeconds,
      endSeconds,
      fontFamily,
      brandColor,
      animation,
      durationSeconds,
      width,
      height,
      outputPath,
      fps = 30,
    } = req.body;

    if (!outputPath) {
      return res.status(400).json({ success: false, error: "outputPath is required" });
    }

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "LowerThirdOverlay",
      inputProps: {
        text,
        subtext,
        startSeconds,
        endSeconds,
        fontFamily,
        brandColor,
        animation,
      },
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.max(1, Math.ceil(durationSeconds * fps)),
        fps,
        width,
        height,
      },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: {
        text,
        subtext,
        startSeconds,
        endSeconds,
        fontFamily,
        brandColor,
        animation,
      },
      pixelFormat: "yuva420p",
      imageFormat: "png",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    console.error("render-lower-third failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/render-motion-graphics", async (req, res) => {
  try {
    const { plan, durationSeconds, width, height, outputPath, fps = 30 } = req.body;

    if (!outputPath) {
      return res.status(400).json({ success: false, error: "outputPath is required" });
    }
    if (!plan || !Array.isArray(plan.elements)) {
      return res.status(400).json({ success: false, error: "plan.elements is required" });
    }

    const fontFamily = plan.fontFamily || "Montserrat";
    const theme = plan.theme;
    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "MotionGraphicsOverlay",
      inputProps: { plan, fontFamily, theme },
    });

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.max(1, Math.ceil(durationSeconds * fps)),
        fps,
        width,
        height,
      },
      serveUrl: bundleLocation,
      codec: "vp8",
      outputLocation: outputPath,
      inputProps: { plan, fontFamily, theme },
      pixelFormat: "yuva420p",
      imageFormat: "png",
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    console.error("render-motion-graphics failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const { execFileSync } = require("child_process");

function compileDirectorTimeline(body) {
  const script = path.join(__dirname, "scripts", "compile-director.ts");
  const stdout = execFileSync("npx", ["tsx", script], {
    input: JSON.stringify(body),
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    cwd: __dirname,
  });
  return JSON.parse(stdout);
}

function prepareStyledShortTimeline(body) {
  const script = path.join(__dirname, "scripts", "prepare-styled-short.ts");
  const stdout = execFileSync("npx", ["tsx", script], {
    input: JSON.stringify(body),
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    cwd: __dirname,
  });
  return JSON.parse(stdout);
}

function applyPlatformVariant(body) {
  const script = path.join(__dirname, "scripts", "apply-platform-variant.ts");
  const stdout = execFileSync("npx", ["tsx", script], {
    input: JSON.stringify(body),
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    cwd: __dirname,
  });
  return JSON.parse(stdout);
}

function bridgeEditorTimeline(body) {
  const script = path.join(__dirname, "scripts", "bridge-editor-timeline.ts");
  try {
    const stdout = execFileSync("npx", ["tsx", script], {
      input: JSON.stringify(body),
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      cwd: __dirname,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stdout = err && err.stdout ? String(err.stdout) : "";
    if (stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (_parseErr) {
        // fall through to rethrow with stderr context
      }
    }
    const stderr = err && err.stderr ? String(err.stderr) : "";
    const message = stderr.trim() || (err && err.message) || "Editor timeline bridge failed";
    throw new Error(message);
  }
}

app.post("/director/bridge-editor-timeline", (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.timeline) {
      return res.status(400).json({
        success: false,
        error: "timeline is required",
      });
    }
    const result = bridgeEditorTimeline(body);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("director/bridge-editor-timeline failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Editor timeline bridge failed",
    });
  }
});

app.post("/director/compile", (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.projectId || !body.contentType || !body.signals || !body.theme) {
      return res.status(400).json({
        success: false,
        error: "projectId, contentType, signals, and theme are required",
      });
    }
    const result = compileDirectorTimeline(body);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("director/compile failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Director compile failed",
    });
  }
});

app.post("/director/prepare-styled-short", (req, res) => {
  try {
    const body = req.body;
    if (
      !body ||
      body.startFrame == null ||
      body.endFrame == null ||
      !body.targetContentType ||
      !body.projectId ||
      !body.theme
    ) {
      return res.status(400).json({
        success: false,
        error:
          "startFrame, endFrame, targetContentType, projectId, and theme are required",
      });
    }
    const result = prepareStyledShortTimeline(body);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("director/prepare-styled-short failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Styled short preparation failed",
    });
  }
});

app.post("/director/apply-platform-variant", (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.timeline || !body.platformVariant) {
      return res.status(400).json({
        success: false,
        error: "timeline and platformVariant are required",
      });
    }
    const result = applyPlatformVariant(body);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("director/apply-platform-variant failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Platform variant application failed",
    });
  }
});

app.post("/render-director", async (req, res) => {
  try {
    const {
      timeline,
      assetUrls = {},
      primaryVideoSrc,
      dialogueSrc,
      cameraFeeds = [],
      sfxUrls = {},
      fontFamily = "Montserrat",
      outputPath,
      platformVariant,
      fps = 30,
      width,
      height,
      frameRange,
    } = req.body;

    if (!timeline || !outputPath) {
      return res.status(400).json({ success: false, error: "timeline and outputPath are required" });
    }

    let renderTimeline = timeline;
    if (platformVariant) {
      const variantResult = applyPlatformVariant({ timeline, platformVariant });
      if (!variantResult.success) {
        return res.status(500).json(variantResult);
      }
      renderTimeline = variantResult.timeline;
    }

    const bundleLocation = await getBundle();
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "DirectorRender",
      inputProps: {
        timeline: renderTimeline,
        assetUrls,
        primaryVideoSrc,
        dialogueSrc,
        cameraFeeds,
        sfxUrls,
        fontFamily,
      },
    });

    const durationInFrames = Math.max(
      1,
      Number(renderTimeline.durationInFrames) || Math.ceil((renderTimeline.durationSeconds || 10) * fps),
    );

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames,
        fps: Number(renderTimeline.fps) || fps,
        width: width || Number(renderTimeline.width) || 1920,
        height: height || Number(renderTimeline.height) || 1080,
      },
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      ...(Array.isArray(frameRange) && frameRange.length === 2
        ? { frameRange: [Number(frameRange[0]), Number(frameRange[1])] }
        : {}),
      inputProps: {
        timeline,
        assetUrls,
        primaryVideoSrc,
        dialogueSrc,
        cameraFeeds,
        sfxUrls,
        fontFamily,
      },
    });

    res.json({ success: true, outputPath });
  } catch (err) {
    console.error("render-director failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Remotion render service listening on http://${HOST}:${PORT}`);
});
