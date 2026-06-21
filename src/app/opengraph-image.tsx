import { ImageResponse } from "next/og";

export const alt = "Kuot — the research agent that cites and pays its sources";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Code-generated social card (no binary asset). On-brand: ivory paper + emerald.
export default function OpengraphImage() {
  const ink = "#1b1a17";
  const accent = "#0b6e4f";
  const muted = "#6f6b62";
  const rule = "#e6e2d8";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fcfbf6",
          padding: "72px 80px",
          // faint dotted "paper" grid
          backgroundImage: "radial-gradient(#1b1a17 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fcfbf6",
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 26, letterSpacing: 4, color: muted, textTransform: "uppercase" }}>
            MetaMask Smart Accounts · 1Shot · Venice AI
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 132, fontWeight: 800, color: ink, letterSpacing: -2, lineHeight: 1 }}>
            Kuot
          </div>
          <div style={{ marginTop: 24, fontSize: 44, color: ink, display: "flex", flexWrap: "wrap" }}>
            The research agent that cites
            <span style={{ color: accent, fontStyle: "italic", marginLeft: 14, marginRight: 14 }}>and pays</span>
            its sources.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: `1px solid ${accent}`,
              color: accent,
              borderRadius: 999,
              padding: "10px 22px",
              fontSize: 26,
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: 999, background: accent, display: "flex" }} />
            live on Sepolia
          </div>
          <div style={{ fontSize: 26, color: muted, border: `1px solid ${rule}`, borderRadius: 999, padding: "10px 22px" }}>
            every citation is a real USDC payment
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
