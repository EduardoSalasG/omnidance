import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Omnidance — la escena SBK de Santiago";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "#a78bfa",
            letterSpacing: "-0.03em",
          }}
        >
          Omnidance
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 40,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Salsa · Bachata · Cubano · Santiago
        </div>
      </div>
    ),
    size,
  );
}
