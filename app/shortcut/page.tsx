export default function ShortcutPage() {
  return (
    <main style={{
      maxWidth: 560, margin: "0 auto", padding: "2.5rem 1.25rem 4rem",
      fontFamily: "var(--sans)", color: "var(--text)",
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "2rem" }}>
        <span style={{ fontSize: "2rem", color: "var(--accent)" }}>◎</span>
        <div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.1rem", fontWeight: 500 }}>Shortcuts Setup</h1>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.1rem" }}>
            Video → Live Photo with no UI
          </p>
        </div>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.75rem" }}>How it works</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.7 }}>
            Your Shortcut sends a video to <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", background: "var(--border)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>/api/convert</code>,
            gets back a ZIP with <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", background: "var(--border)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>livephoto.mov</code> +{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", background: "var(--border)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>livephoto.jpg</code>,
            unzips them, and saves both to Photos. iOS stitches the matching pair into a Live Photo automatically.
          </p>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "0.9rem", fontWeight: 500 }}>Shortcut steps</h2>
          </div>
          {[
            ["Receive input", "Set "Receive" to Media. Works from the Share Sheet or the Shortcuts widget."],
            ["Get variable", "Set Variable → "Input" (the video from step 1)."],
            ["Get contents of URL", [
              "URL: https://YOUR-APP.vercel.app/api/convert",
              "Method: POST",
              "Request Body: Form",
              "Add field → Key: video · Value: Input (from step 1) · Type: File",
              "Optional: add key start (seconds) and duration (seconds, default 3)",
            ]],
            ["Extract archive", "Pass the result of step 3. This unzips the response into two files."],
            ["Filter files", "Filter: Name ends with .mov → store as "MOV file""],
            ["Filter files", "Filter: Name ends with .jpg → store as "JPG file""],
            ["Save to Photo Album", "File: MOV file → Album: Recents"],
            ["Save to Photo Album", "File: JPG file → Album: Recents"],
            ["Done", "Open Photos — find the image, tap the Live badge to confirm."],
          ].map(([title, body], i) => (
            <div key={i} style={{
              display: "flex", gap: "1rem", padding: "0.9rem 1.25rem",
              borderBottom: i < 8 ? "1px solid var(--border)" : "none",
              alignItems: "flex-start",
            }}>
              <span style={{
                fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--accent)",
                background: "var(--accent-dim)", borderRadius: 3, padding: "0.15rem 0.4rem",
                flexShrink: 0, marginTop: "0.15rem",
              }}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.3rem" }}>{title as string}</p>
                {Array.isArray(body) ? (
                  <ul style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.8, paddingLeft: "1rem" }}>
                    {(body as string[]).map((line, j) => <li key={j}>{line}</li>)}
                  </ul>
                ) : (
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.65 }}>{body as string}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.75rem" }}>API reference</h2>
          <pre style={{
            fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted)",
            lineHeight: 1.8, overflow: "auto",
          }}>{`POST /api/convert
Content-Type: multipart/form-data

Fields:
  video     (required) video file
  start     (optional) trim start, seconds  [default: 0]
  duration  (optional) clip length, 0.5–10s [default: 3]

Response: application/zip
  livephoto.mov  — H.264 video in .mov
  livephoto.jpg  — still frame`}</pre>
        </div>

      </section>
    </main>
  );
}
