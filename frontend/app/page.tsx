
"use client";

import { useRef, useState } from "react";

const API = "http://localhost:8000";

type Location = {
  lat: number;
  lng: number;
};

type Detection = {
  class: string;
  confidence: number;
  box: number[];
};

export default function Home() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsWatch = useRef<number | null>(null);
  const running = useRef(false);
  const busy = useRef(false);
  const lastGPS = useRef<Location | null>(null);

  const [active, setActive] = useState(false);
  const [intervalSec, setIntervalSec] = useState(2);
  const [status, setStatus] = useState("Ready to start");
  const [gps, setGps] = useState("Waiting for permission");
  const [count, setCount] = useState(0);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [lastResult, setLastResult] = useState<Detection[]>([]);
  const [lastTime, setLastTime] = useState("--");

  async function start() {
    if (running.current) return;

    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by this browser");
      return;
    }

    try {
      setStatus("Requesting camera permission...");

      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      stream.current = media;

      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }

      lastGPS.current = null;
      running.current = true;
      setActive(true);
      setStatus("Waiting for GPS location...");
      setGps("Acquiring location...");

      gpsWatch.current = navigator.geolocation.watchPosition(
        (position) => {
          if (!running.current) return;

          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          lastGPS.current = location;
          setGps(
            `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
          );
        },
        (error) => {
          setGps("Location unavailable");
          setStatus(`GPS error: ${error.message}`);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 15000,
        }
      );

      timer.current = setInterval(async () => {
        if (
          !running.current ||
          busy.current ||
          !video.current ||
          !canvas.current ||
          video.current.readyState < 2
        ) {
          return;
        }

        const location = lastGPS.current;

        if (!location) {
          setStatus("Waiting for GPS fix...");
          return;
        }

        const ctx = canvas.current.getContext("2d");
        if (!ctx) return;

        canvas.current.width = video.current.videoWidth;
        canvas.current.height = video.current.videoHeight;

        ctx.drawImage(video.current, 0, 0);

        const frame = canvas.current.toDataURL("image/jpeg", 0.7);

        busy.current = true;
        setStatus("Running pothole detection...");

        try {
          const response = await fetch(`${API}/detect-frame`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              frame,
              location,
            }),
          });

          if (!response.ok) {
            const message = await response.text();
            throw new Error(message);
          }

          const result = await response.json();

          if (!running.current) return;

          setCount((old) => old + result.pothole_count);
          setFramesProcessed((old) => old + 1);
          setLastResult(result.detections || []);
          setLastTime(new Date().toLocaleTimeString());
          setStatus("Detection completed and saved");
        } catch (error) {
          if (running.current) {
            setStatus(
              error instanceof Error
                ? `API error: ${error.message}`
                : "Unable to contact FastAPI"
            );
          }
        } finally {
          busy.current = false;
        }
      }, intervalSec * 1000);

      setStatus("Live monitoring started");
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      running.current = false;
      setActive(false);

      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to start camera"
      );
    }
  }

  function stop() {
    running.current = false;

    if (timer.current) clearInterval(timer.current);
    timer.current = null;

    if (gpsWatch.current !== null) {
      navigator.geolocation.clearWatch(gpsWatch.current);
    }
    gpsWatch.current = null;

    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;

    if (video.current) video.current.srcObject = null;

    setActive(false);
    setStatus("Monitoring stopped");
    setGps("GPS paused");
  }

  function reset() {
    stop();

    lastGPS.current = null;
    busy.current = false;

    setCount(0);
    setFramesProcessed(0);
    setLastResult([]);
    setLastTime("--");
    setGps("Waiting for permission");
    setStatus("Ready to start");
  }

  const buttonStyle = {
    padding: "12px 20px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  } as const;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        color: "#17243a",
        fontFamily: "Arial, sans-serif",
        padding: "28px 16px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 26,
          }}
        >
          <div>
            <div
              style={{
                color: "#2563eb",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 2,
              }}
            >
              ROADSENSE / LIVE MONITOR
            </div>
            <h1 style={{ margin: "9px 0", fontSize: 30 }}>
              Pothole Detection
            </h1>
            <p style={{ margin: 0, color: "#64748b" }}>
              Camera-based road damage monitoring
            </p>
          </div>

          <div
            style={{
              padding: "10px 16px",
              borderRadius: 30,
              background: active ? "#dcfce7" : "#e2e8f0",
              color: active ? "#166534" : "#475569",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {active ? "● LIVE" : "● STOPPED"}
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 15,
            marginBottom: 22,
          }}
        >
          {[
            { label: "Pothole detections", value: count },
            { label: "Frames processed", value: framesProcessed },
            { label: "Interval", value: `${intervalSec} second(s)` },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "white",
                padding: 22,
                border: "1px solid #e2e8f0",
                borderRadius: 15,
              }}
            >
              <div style={{ color: "#64748b", fontSize: 13 }}>
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 27,
                  fontWeight: 700,
                  marginTop: 12,
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 20,
          }}
        >
          <div
            style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <h2 style={{ fontSize: 18, marginTop: 0 }}>
              Live Camera
            </h2>

            <video
              ref={video}
              autoPlay
              playsInline
              muted
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "16 / 10",
                objectFit: "cover",
                background: "#111827",
                borderRadius: 12,
              }}
            />

            <canvas ref={canvas} style={{ display: "none" }} />

            <label
              style={{
                display: "block",
                marginTop: 18,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Detection interval
            </label>

            <select
              value={intervalSec}
              disabled={active}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              style={{
                width: "100%",
                marginTop: 8,
                padding: 12,
                border: "1px solid #cbd5e1",
                borderRadius: 9,
                background: active ? "#f1f5f9" : "white",
                fontSize: 14,
              }}
            >
              <option value={1}>Every 1 second</option>
              <option value={2}>Every 2 seconds</option>
            </select>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 18,
              }}
            >
              <button
                onClick={start}
                disabled={active}
                style={{
                  ...buttonStyle,
                  flex: 1,
                  background: active ? "#94a3b8" : "#2563eb",
                  color: "white",
                }}
              >
                ▶ Start
              </button>

              <button
                onClick={stop}
                disabled={!active}
                style={{
                  ...buttonStyle,
                  flex: 1,
                  background: active ? "#dc2626" : "#cbd5e1",
                  color: "white",
                }}
              >
                ■ Stop
              </button>

              <button
                onClick={reset}
                style={{
                  ...buttonStyle,
                  background: "#e2e8f0",
                  color: "#334155",
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div
            style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 22,
            }}
          >
            <h2 style={{ fontSize: 18, marginTop: 0 }}>
              Monitoring Status
            </h2>

            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: "#f8fafc",
                marginBottom: 18,
              }}
            >
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Current activity
              </div>
              <p style={{ fontWeight: 700, marginBottom: 0 }}>
                {status}
              </p>
            </div>

            <div
              style={{
                padding: 16,
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ color: "#64748b", fontSize: 13 }}>
                GPS coordinates
              </div>
              <p
                style={{
                  fontWeight: 600,
                  overflowWrap: "anywhere",
                  marginBottom: 0,
                }}
              >
                {gps}
              </p>
            </div>

            <div
              style={{
                padding: 16,
                background: "#eff6ff",
                color: "#1e40af",
                borderRadius: 12,
                marginBottom: 18,
                fontSize: 14,
              }}
            >
              <b>Last detection</b>
              <p style={{ marginBottom: 4 }}>
                {lastResult.length} detected objects in the latest frame
              </p>
              <p style={{ margin: 0, fontSize: 12 }}>
                Time: {lastTime}
              </p>
            </div>

            <h3 style={{ fontSize: 15 }}>Detected objects</h3>

            <div style={{ maxHeight: 230, overflowY: "auto" }}>
              {lastResult.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: 14 }}>
                  No objects detected in the latest frame.
                </p>
              ) : (
                lastResult.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                    }}
                  >
                    <b>{item.class}</b>
                    <span style={{ float: "right", color: "#2563eb" }}>
                      {(item.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
            </div>

            <p
              style={{
                marginTop: 18,
                fontSize: 12,
                lineHeight: 1.6,
                color: "#64748b",
              }}
            >
              Each successful inference is saved locally by FastAPI
              with its timestamp and GPS coordinates.
            </p>
          </div>
        </section>

        <footer
          style={{
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 12,
            marginTop: 25,
          }}
        >
          RoadSense · Next.js · FastAPI · YOLO
        </footer>
      </div>
    </main>
  );
}
