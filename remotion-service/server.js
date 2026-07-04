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

app.listen(PORT, HOST, () => {
  console.log(`Remotion render service listening on http://${HOST}:${PORT}`);
});
