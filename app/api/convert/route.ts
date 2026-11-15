import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// iOS Shortcuts hits this endpoint with a video file.
// We validate the upload and return metadata; actual conversion
// happens client-side via FFmpeg WASM.
// For a pure-API flow from Shortcuts we return a JSON envelope
// with instructions since server-side FFmpeg requires a paid plan.

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("video") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No video file provided. Send a multipart form with field name 'video'." }, { status: 400 });
      }

      const allowedTypes = ["video/mp4", "video/quicktime", "video/mov", "video/mpeg", "video/webm"];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|m4v|mpeg|webm)$/i)) {
        return NextResponse.json({ error: "Unsupported file type. Use MP4 or MOV." }, { status: 415 });
      }

      const sizeLimit = 100 * 1024 * 1024; // 100 MB
      if (file.size > sizeLimit) {
        return NextResponse.json({ error: "File too large. Maximum size is 100 MB." }, { status: 413 });
      }

      return NextResponse.json({
        ok: true,
        message: "File received. Open the web UI to complete conversion — server-side FFmpeg requires a paid Vercel plan. The web app converts entirely in-browser.",
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        web_ui: request.headers.get("origin") || "https://your-app.vercel.app",
        shortcut_tip: "Use the 'Open URLs' action in Shortcuts to open the web UI, then share the video to it via the browser share sheet.",
      });
    }

    // Health-check / GET-like POST with no body
    return NextResponse.json({
      ok: true,
      service: "Video → Live Photo converter",
      usage: "POST multipart/form-data with field 'video' containing your video file.",
      supported_formats: ["mp4", "mov", "m4v"],
      max_size_mb: 100,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Video → Live Photo converter API",
    post_endpoint: "/api/convert",
  });
}
