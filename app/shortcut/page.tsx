type Step = {
  title: string;
  body: string | string[];
};

const steps: Step[] = [
  {
    title: "Receive input",
    body: "Set Receive to Media. Works from the Share Sheet or the Shortcuts widget.",
  },
  {
    title: "Get contents of URL",
    body: [
      "URL: https://YOUR-APP.vercel.app/api/convert",
      "Method: POST",
      "Request Body: Form",
      "Add field: Key = video, Value = Shortcut Input, Type = File",
      "Optional fields: start (seconds) and duration (seconds, default 3)",
    ],
  },
  {
    title: "Extract archive",
    body: "Pass the URL result. This unzips the response into two files.",
  },
  {
    title: "Filter files",
    body: "Filter: Name ends with .mov — save result as MOV File",
  },
  {
    title: "Filter files",
    body: "Filter: Name ends with .jpg — save result as JPG File",
  },
  {
    title: "Save to Photo Album",
    body: "File: MOV File — Album: Recents",
  },
  {
    title: "Save to Photo Album",
    body: "File: JPG File — Album: Recents",
  },
  {
    title: "Done",
    body: "Open Photos, find the image, and tap the Live badge to confirm.",
  },
];

const mono: React.CSSProperties = {
  fontFamily: "var(--mono)",
};

const code: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: "0.78rem",
  background: "var(--border)",
  padding: "0.1rem 0.35rem",
  borderRadius: 3,
};

export default function ShortcutPage() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "2.5rem 1.25rem 4rem",
        fontFamily: "var(--sans)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.875rem",
          marginBottom: "2rem",
        }}
      >
        <span style={{ fontSize: "2rem", color: "var(--accent)" }}>{"◎"}</span>
        <div>
          <h1 style={{ ...mono, fontSize: "1.1rem", fontWeight: 500 }}>
            Shortcuts Setup
          </h1>
          <p
            style={{
              ...mono,
              fontSize: "0.75rem",
              color: "var(--muted)",
              marginTop: "0.1rem",
            }}
          >
            Video to Live Photo with no UI
          </p>
        </div>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* How it works */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.75rem" }}>
            How it works
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.7 }}>
            Your Shortcut sends a video to{" "}
            <code style={code}>/api/convert</code>, gets back a ZIP with{" "}
            <code style={code}>livephoto.mov</code> and{" "}
            <code style={code}>livephoto.jpg</code>, unzips them, and saves
            both to Photos. iOS stitches the matching pair into a Live Photo
            automatically.
          </p>
        </div>

        {/* Steps */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.9rem 1.25rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h2 style={{ fontSize: "0.9rem", fontWeight: 500 }}>Shortcut steps</h2>
          </div>

          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "1rem",
                padding: "0.9rem 1.25rem",
                borderBottom:
                  i < steps.length - 1 ? "1px solid var(--border)" : "none",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  ...mono,
                  fontSize: "0.7rem",
                  color: "var(--accent)",
                  background: "var(--accent-dim)",
                  borderRadius: 3,
                  padding: "0.15rem 0.4rem",
                  flexShrink: 0,
                  marginTop: "0.15rem",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    marginBottom: "0.3rem",
                  }}
                >
                  {step.title}
                </p>
                {Array.isArray(step.body) ? (
                  <ul
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                      lineHeight: 1.8,
                      paddingLeft: "1rem",
                    }}
                  >
                    {step.body.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                      lineHeight: 1.65,
                    }}
                  >
                    {step.body}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* API reference */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.75rem" }}>
            API reference
          </h2>
          <pre
            style={{
              ...mono,
              fontSize: "0.72rem",
              color: "var(--muted)",
              lineHeight: 1.8,
              overflow: "auto",
            }}
          >{`POST /api/convert
Content-Type: multipart/form-data

Fields:
  video     (required) video file
  start     (optional) trim start in seconds  [default: 0]
  duration  (optional) clip length 0.5-10s    [default: 3]

Response: application/zip
  livephoto.mov  -- H.264 video in .mov
  livephoto.jpg  -- still frame`}</pre>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--muted)", ...mono }}>
          <a href="/" style={{ color: "var(--accent)" }}>
            Back to web converter
          </a>
          {" "}·{" "}
          <a href="/api/convert" target="_blank" style={{ color: "var(--accent)" }}>
            API
          </a>
        </p>

      </section>
    </main>
  );
}
