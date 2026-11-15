"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./Converter.module.css";

type Stage = "idle" | "loading-ffmpeg" | "ready" | "converting" | "done" | "error";

interface OutputFiles {
  mov: Blob;
  jpg: Blob;
  movName: string;
  jpgName: string;
}

export default function Converter() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [output, setOutput] = useState<OutputFiles | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [trim, setTrim] = useState<[number, number]>([0, 3]);

  const ffmpegRef = useRef<any>(null);
  const fileRef = useRef<File | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load FFmpeg lazily
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return;
    setStage("loading-ffmpeg");
    setProgressLabel("Loading converter…");

    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    // Single-threaded core works without SharedArrayBuffer (safe on mobile Safari)
    const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
    const stURL   = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
    const coreBase = hasSharedArrayBuffer ? baseURL : stURL;

    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
      setProgress(Math.round(p * 100));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
      ...(hasSharedArrayBuffer && {
        workerURL: await toBlobURL(`${coreBase}/ffmpeg-core.worker.js`, "text/javascript"),
      }),
    });

    ffmpegRef.current = ffmpeg;
    setStage("ready");
    setProgressLabel("");
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|m4v|webm|mpeg)$/i)) {
        setErrorMsg("Please choose a video file (MP4, MOV, etc.)");
        setStage("error");
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        setErrorMsg("File is too large (max 200 MB).");
        setStage("error");
        return;
      }

      fileRef.current = file;
      setFileName(file.name.replace(/\.[^.]+$/, ""));
      setOutput(null);
      setErrorMsg("");

      const url = URL.createObjectURL(file);
      setVideoSrc(url);

      await loadFFmpeg();
    },
    [loadFFmpeg]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onVideoMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    setDuration(d);
    // Default trim: first 3 s (or full if shorter)
    setTrim([0, Math.min(3, d)]);
  };

  const convert = async () => {
    const ffmpeg = ffmpegRef.current;
    const file = fileRef.current;
    if (!ffmpeg || !file) return;

    setStage("converting");
    setProgress(0);

    const { fetchFile } = await import("@ffmpeg/util");

    const baseName = fileName || "livephoto";
    const inName = "input" + file.name.match(/\.[^.]+$/)?.[0] || "input.mp4";
    const movName = `${baseName}.mov`;
    const jpgName = `${baseName}.jpg`;

    try {
      setProgressLabel("Reading file…");
      await ffmpeg.writeFile(inName, await fetchFile(file));

      const [start, end] = trim;
      const trimDuration = end - start;

      // 1. Extract the still (key frame at the start of the clip)
      setProgressLabel("Extracting still image…");
      await ffmpeg.exec([
        "-ss", String(start),
        "-i", inName,
        "-vframes", "1",
        "-q:v", "2",
        "-f", "image2",
        jpgName,
      ]);

      // 2. Re-encode the video as a MOV compatible with Live Photos
      //    Live Photos expect: H.264 video, AAC audio (or no audio), .mov container
      setProgressLabel("Encoding video…");
      await ffmpeg.exec([
        "-ss", String(start),
        "-i", inName,
        "-t", String(trimDuration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        movName,
      ]);

      setProgressLabel("Packaging…");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const movRaw: any = await ffmpeg.readFile(movName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jpgRaw: any = await ffmpeg.readFile(jpgName);

      // Copy bytes into a fresh Uint8Array so Blob constructor gets a clean type
      const toBlob = (raw: any, mime: string): Blob => {
        const src: Uint8Array =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
        const copy = new Uint8Array(src.byteLength);
        copy.set(src);
        return new Blob([copy], { type: mime });
      };

      setOutput({
        mov: toBlob(movRaw, "video/quicktime"),
        jpg: toBlob(jpgRaw, "image/jpeg"),
        movName,
        jpgName,
      });

      // Clean up
      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(movName).catch(() => {});
      await ffmpeg.deleteFile(jpgName).catch(() => {});

      setStage("done");
      setProgressLabel("Done");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Conversion failed.");
      setStage("error");
    }
  };

  const downloadAll = async () => {
    if (!output) return;

    // Download both files
    const dl = (blob: Blob, name: string) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
    };

    dl(output.mov, output.movName);
    setTimeout(() => dl(output.jpg, output.jpgName), 400);
  };

  const reset = () => {
    setStage(ffmpegRef.current ? "ready" : "idle");
    setOutput(null);
    setErrorMsg("");
    setVideoSrc(null);
    setFileName("");
    setDuration(null);
    fileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  };

  const trimLabel = duration
    ? `${trim[0].toFixed(1)}s – ${trim[1].toFixed(1)}s (${(trim[1] - trim[0]).toFixed(1)}s)`
    : "";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>◎</span>
        <div>
          <h1 className={styles.title}>Live Photo Maker</h1>
          <p className={styles.subtitle}>Video → iOS Live Photo</p>
        </div>
      </header>

      {(stage === "idle" || stage === "loading-ffmpeg" || stage === "ready") && !output && (
        <section
          className={`${styles.dropzone} ${dragOver ? styles.dragOver : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mp4,.mov,.m4v"
            className={styles.hiddenInput}
            onChange={handleInputChange}
          />
          {stage === "loading-ffmpeg" ? (
            <p className={styles.loadingText}>Loading FFmpeg…</p>
          ) : (
            <>
              <span className={styles.dropIcon}>↑</span>
              <p className={styles.dropMain}>Drop a video or tap to choose</p>
              <p className={styles.dropSub}>MP4 · MOV · M4V — up to 200 MB</p>
            </>
          )}
        </section>
      )}

      {videoSrc && stage !== "converting" && stage !== "done" && (
        <section className={styles.preview}>
          <video
            ref={videoRef}
            src={videoSrc}
            className={styles.previewVideo}
            controls
            playsInline
            muted
            onLoadedMetadata={onVideoMeta}
          />

          {duration !== null && (
            <div className={styles.trimSection}>
              <label className={styles.trimLabel}>
                Trim clip &nbsp;<span className={styles.trimValue}>{trimLabel}</span>
              </label>
              <div className={styles.trimRow}>
                <div className={styles.rangeGroup}>
                  <span className={styles.rangeHint}>Start</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, (duration ?? 3) - 0.5)}
                    step={0.1}
                    value={trim[0]}
                    className={styles.range}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setTrim([v, Math.max(v + 0.5, trim[1])]);
                    }}
                  />
                </div>
                <div className={styles.rangeGroup}>
                  <span className={styles.rangeHint}>End</span>
                  <input
                    type="range"
                    min={0.5}
                    max={duration ?? 3}
                    step={0.1}
                    value={trim[1]}
                    className={styles.range}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setTrim([Math.min(trim[0], v - 0.5), v]);
                    }}
                  />
                </div>
              </div>
              <p className={styles.trimNote}>Live Photos work best at 1.5–3 seconds.</p>
            </div>
          )}

          <button className={styles.convertBtn} onClick={convert}>
            Convert to Live Photo
          </button>
        </section>
      )}

      {stage === "converting" && (
        <section className={styles.converting}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.progressText}>
            {progressLabel} {progress > 0 && progress < 100 ? `${progress}%` : ""}
          </p>
        </section>
      )}

      {stage === "done" && output && (
        <section className={styles.done}>
          <div className={styles.doneIcon}>✓</div>
          <h2 className={styles.doneTitle}>Ready</h2>
          <p className={styles.doneBody}>
            Download both files, then add them to your iOS Photos library using
            the steps below.
          </p>

          <div className={styles.fileList}>
            <FileRow
              label="Video clip"
              name={output.movName}
              ext=".mov"
              blob={output.mov}
            />
            <FileRow
              label="Still image"
              name={output.jpgName}
              ext=".jpg"
              blob={output.jpg}
            />
          </div>

          <button className={styles.downloadAll} onClick={downloadAll}>
            Download both files
          </button>

          <details className={styles.instructions}>
            <summary>How to import to Photos on iOS</summary>
            <ol className={styles.stepList}>
              <li>AirDrop or iCloud both files to your iPhone.</li>
              <li>
                Open the <strong>Files</strong> app. Select both the{" "}
                <code>.jpg</code> and <code>.mov</code> — they must share the
                same base filename.
              </li>
              <li>
                Share → <strong>Save to Photos</strong>. iOS recognises the pair
                and stitches them into a Live Photo automatically.
              </li>
              <li>
                Open Photos, find the image, and tap the{" "}
                <strong>Live</strong> badge to confirm.
              </li>
            </ol>
          </details>

          <button className={styles.resetBtn} onClick={reset}>
            Convert another
          </button>
        </section>
      )}

      {stage === "error" && (
        <section className={styles.errorBox}>
          <p className={styles.errorText}>{errorMsg || "Something went wrong."}</p>
          <button className={styles.resetBtn} onClick={reset}>Try again</button>
        </section>
      )}

      <footer className={styles.footer}>
        Conversion runs entirely in your browser — no files are uploaded.
        &ensp;·&ensp;
        <a href="/shortcut" target="_blank">iOS Shortcuts setup</a>
        &ensp;·&ensp;
        <a href="/api/convert" target="_blank">API</a>
      </footer>
    </div>
  );
}

function FileRow({ label, name, ext, blob }: { label: string; name: string; ext: string; blob: Blob }) {
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileExt}>{ext}</span>
      <span className={styles.fileName}>{name}</span>
      <button className={styles.dlBtn} onClick={download}>↓</button>
    </div>
  );
}
