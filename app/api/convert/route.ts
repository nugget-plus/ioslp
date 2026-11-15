import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

// Find ffmpeg — Vercel has it at /usr/bin/ffmpeg on Node runtimes
async function findFFmpeg(): Promise<string> {
  const candidates = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"];
  for (const p of candidates) {
    try {
      await execFileAsync(p, ["-version"]);
      return p;
    } catch {}
  }
  throw new Error("ffmpeg not found on this server");
}

function buildZip(files: { name: string; data: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // Manual ZIP builder — avoids the archiver dep entirely
    // Use JSZip-compatible approach via raw bytes
    // Simple approach: return multipart instead, Shortcuts handles it fine
    // Actually: return both files as a single binary ZIP manually
    
    // We'll use the built-in zlib + manual ZIP format
    const { createDeflateRaw } = require("zlib");
    
    let offset = 0;
    const localHeaders: Buffer[] = [];
    const centralDir: Buffer[] = [];
    const offsets: number[] = [];

    const encodeStr = (s: string) => Buffer.from(s, "utf8");

    function crc32(buf: Buffer): number {
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    const processedFiles: { name: Buffer; data: Buffer; crc: number; size: number }[] = [];

    for (const f of files) {
      const name = encodeStr(f.name);
      const crc = crc32(f.data);
      processedFiles.push({ name, data: f.data, crc, size: f.data.length });
    }

    for (const f of processedFiles) {
      offsets.push(offset);
      const local = Buffer.alloc(30 + f.name.length);
      local.writeUInt32LE(0x04034b50, 0);  // sig
      local.writeUInt16LE(20, 4);           // version needed
      local.writeUInt16LE(0, 6);            // flags
      local.writeUInt16LE(0, 8);            // compression: stored
      local.writeUInt16LE(0, 10);           // mod time
      local.writeUInt16LE(0, 12);           // mod date
      local.writeUInt32LE(f.crc, 14);       // crc32
      local.writeUInt32LE(f.size, 18);      // compressed size
      local.writeUInt32LE(f.size, 22);      // uncompressed size
      local.writeUInt16LE(f.name.length, 26);
      local.writeUInt16LE(0, 28);           // extra length
      f.name.copy(local, 30);
      chunks.push(local);
      chunks.push(f.data);
      offset += local.length + f.data.length;
    }

    const cdOffset = offset;
    for (let i = 0; i < processedFiles.length; i++) {
      const f = processedFiles[i];
      const cd = Buffer.alloc(46 + f.name.length);
      cd.writeUInt32LE(0x02014b50, 0);  // sig
      cd.writeUInt16LE(20, 4);           // version made by
      cd.writeUInt16LE(20, 6);           // version needed
      cd.writeUInt16LE(0, 8);            // flags
      cd.writeUInt16LE(0, 10);           // compression
      cd.writeUInt16LE(0, 12);           // mod time
      cd.writeUInt16LE(0, 14);           // mod date
      cd.writeUInt32LE(f.crc, 16);       // crc32
      cd.writeUInt32LE(f.size, 20);      // compressed size
      cd.writeUInt32LE(f.size, 24);      // uncompressed size
      cd.writeUInt16LE(f.name.length, 28);
      cd.writeUInt16LE(0, 30);           // extra
      cd.writeUInt16LE(0, 32);           // comment
      cd.writeUInt16LE(0, 34);           // disk start
      cd.writeUInt16LE(0, 36);           // int attr
      cd.writeUInt32LE(0, 38);           // ext attr
      cd.writeUInt32LE(offsets[i], 42);  // local header offset
      f.name.copy(cd, 46);
      chunks.push(cd);
      offset += cd.length;
    }

    const cdSize = offset - cdOffset;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(processedFiles.length, 8);
    eocd.writeUInt16LE(processedFiles.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);
    chunks.push(eocd);

    resolve(Buffer.concat(chunks));
  });
}

export async function POST(request: NextRequest) {
  const workDir = join(tmpdir(), randomUUID());
  await mkdir(workDir, { recursive: true });

  const cleanUp = async (...files: string[]) => {
    await Promise.all(files.map(f => unlink(f).catch(() => {})));
  };

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Send multipart/form-data with a 'video' field." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const startStr = formData.get("start") as string | null;
    const durationStr = formData.get("duration") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No 'video' field found." }, { status: 400 });
    }

    if (file.size > 150 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 150 MB)." }, { status: 413 });
    }

    const start = parseFloat(startStr ?? "0") || 0;
    const duration = parseFloat(durationStr ?? "3") || 3;
    const clampedDuration = Math.min(Math.max(0.5, duration), 10);

    // Write upload to temp
    const ext = file.name.match(/\.[^.]+$/)?.[0] ?? ".mp4";
    const inPath  = join(workDir, `input${ext}`);
    const movPath = join(workDir, "livephoto.mov");
    const jpgPath = join(workDir, "livephoto.jpg");

    const bytes = await file.arrayBuffer();
    await writeFile(inPath, Buffer.from(bytes));

    let ffmpeg: string;
    try {
      ffmpeg = await findFFmpeg();
    } catch {
      await cleanUp(inPath);
      return NextResponse.json(
        { error: "FFmpeg is not available on this server. Use the web UI instead." },
        { status: 501 }
      );
    }

    // Extract still frame
    await execFileAsync(ffmpeg, [
      "-ss", String(start),
      "-i", inPath,
      "-vframes", "1",
      "-q:v", "2",
      "-f", "image2",
      jpgPath,
    ]);

    // Encode Live Photo video: H.264 + AAC in .mov
    await execFileAsync(ffmpeg, [
      "-ss", String(start),
      "-i", inPath,
      "-t", String(clampedDuration),
      "-c:v", "libx264",
      "-preset", "fast",
      "-profile:v", "high",
      "-level", "4.1",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-y",
      movPath,
    ]);

    const [movBuf, jpgBuf] = await Promise.all([
      readFile(movPath),
      readFile(jpgPath),
    ]);

    await cleanUp(inPath, movPath, jpgPath);

    const zip = await buildZip([
      { name: "livephoto.mov", data: movBuf },
      { name: "livephoto.jpg", data: jpgBuf },
    ]);

    return new NextResponse(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="livephoto.zip"',
        "Content-Length": String(zip.length),
        "X-Files": "livephoto.mov, livephoto.jpg",
      },
    });
  } catch (err: any) {
    console.error("convert error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Conversion failed." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Live Photo converter API",
    usage: {
      method: "POST",
      path: "/api/convert",
      content_type: "multipart/form-data",
      fields: {
        video: "required — video file (MP4, MOV, M4V)",
        start: "optional — trim start in seconds (default: 0)",
        duration: "optional — clip length in seconds, 0.5–10 (default: 3)",
      },
    },
    response: "application/zip containing livephoto.mov + livephoto.jpg",
    ios_import: "In Shortcuts: unzip response → save both files to Photos (same base name = Live Photo)",
  });
}
