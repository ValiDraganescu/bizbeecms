export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", margin: 0 }}>bizbeecms · CMS</h1>
      <p style={{ color: "#666", maxWidth: "32rem" }}>
        A whitelabel CMS instance. The ProjectManager deploys one of these per
        Site to Cloudflare. For now this is the default Next.js install.
      </p>
      <p style={{ color: "#999", fontSize: "0.85rem" }}>
        Running on Next.js + Cloudflare Workers (OpenNext).
      </p>
    </main>
  );
}
