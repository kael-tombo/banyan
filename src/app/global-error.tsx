"use client";

/**
 * Root error boundary. Next.js renders this with a blank document, so it owns
 * its <html>/<body>. Scoped to true render crashes outside every nested
 * boundary — honest copy, no secrets in the output, recovery first.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#e9ede3", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: "#93382a" }}>
            SOMETHING BROKE
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: 28, fontWeight: 600, color: "#1d3b2a" }}>
            Banyan hit an unexpected error
          </h1>
          <p style={{ margin: "12px 0 0", maxWidth: 440, fontSize: 14, lineHeight: 1.6, color: "#4b5563" }}>
            This was a crash on our side, not an action you took — nothing was published or changed. Try again, or
            return to the home page.
          </p>
          {error.digest ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b7280" }}>Reference: {error.digest}</p>
          ) : null}
          <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                borderRadius: 9999,
                background: "#12261b",
                color: "#fff",
                border: "none",
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                borderRadius: 9999,
                border: "1px solid rgba(29,59,42,0.2)",
                background: "#fff",
                color: "#1d3b2a",
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
