
"use client";

import { useRef, useState } from "react";

const API = "http://localhost:8000";

export default function Home() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsWatch = useRef<number | null>(null);
  const frames = useRef<string[]>([]);
  const lastGPS = useRef<any>(null);
  const startGPS = useRef<any>(null);
  const distance = useRef(0);
  const busy = useRef(false);
  const running = useRef(false);

  const [status, setStatus] = useState("Ready to start");
  const [meters, setMeters] = useState(0);
  const [count, setCount] = useState(0);
  const [segments, setSegments] = useState(0);
  const [gps, setGps] = useState("Waiting for GPS");
  const [active, setActive] = useState(false);

  function gap(a: any, b: any) {
    const rad = (n: number) => n * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lng - a.lng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
      Math.sin(dLon / 2) ** 2;

    return 6371000 * 2 * Math.atan2(
      Math.sqrt(x), Math.sqrt(1 - x)
    );
  }

  async function sendSegment(end: any) {
    if (
      busy.current ||
      distance.current < 10 ||
      frames.current.length === 0 ||
      !startGPS.current
    ) return;

    busy.current = true;

    const batch = [...frames.current];
    const start = startGPS.current;
    const distanceM = distance.current;

    frames.current = [];
    distance.current = 0;
    startGPS.current = end;
    setMeters(0);
    setStatus("Analysing road footage...");

    try {
      const response = await fetch(`${API}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: batch,
          start,
          end,
          distance_m: distanceM
        })
      });

      if (!response.ok) throw new Error("Detection request failed");

      const result = await response.json();

      setCount(old => old + result.pothole_count);
      setSegments(old => old + 1);
      setStatus("Segment analysed successfully");
    } catch {
      frames.current.unshift(...batch);
      distance.current += distanceM;
      startGPS.current = start;
      setMeters(Math.floor(distance.current));
      setStatus("API error. Segment retained for retry.");
    } finally {
      busy.current = false;
    }
  }

  async function start() {
    if (running.current) return;

    try {
      setStatus("Opening camera...");

      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });

      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }

      lastGPS.current = null;
      startGPS.current = null;
      distance.current = 0;
      frames.current = [];
      running.current = true;
      setActive(true);
      setStatus("Waiting for GPS...");
      setGps("Acquiring location");

      gpsWatch.current = navigator.geolocation.watchPosition(
        position => {
          if (!running.current) return;

          const p = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          setGps(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);

          if (lastGPS.current) {
            const d = gap(lastGPS.current, p);

            // Ignore implausible jumps
            if (d < 50 && position.coords.accuracy < 50) {
              distance.current += d;
            }
          } else {
            startGPS.current = p;
          }

          lastGPS.current = p;
          setMeters(Math.floor(distance.current));

          if (distance.current >= 10) sendSegment(p);
        },
        error => setStatus("GPS error: " + error.message),
        { enableHighAccuracy: true, maximumAge: 0 }
      );

      timer.current = setInterval(() => {
        if (
          !running.current ||
          !video.current ||
          !canvas.current ||
          video.current.readyState < 2
        ) return;

        canvas.current.width = video.current.videoWidth;
        canvas.current.height = video.current.videoHeight;

        canvas.current.getContext("2d")?.drawImage(
          video.current, 0, 0
        );

        // Sample one frame per second
        if (startGPS.current && frames.current.length < 30) {
          frames.current.push(
            canvas.current.toDataURL("image/jpeg", 0.7)
          );
        }
      }, 1000);

      setStatus("Recording road footage");
    } catch (e: any) {
      stream.current?.getTracks().forEach(t => t.stop());
      stream.current = null;
      running.current = false;
      setActive(false);
      setStatus(e.message || "Unable to access camera");
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

    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;

    if (video.current) video.current.srcObject = null;

    setActive(false);
    setStatus("Recording stopped");
    setGps("GPS paused");
  }

  function reset() {
    stop();

    frames.current = [];
    lastGPS.current = null;
    startGPS.current = null;
    distance.current = 0;

    setMeters(0);
    setCount(0);
    setSegments(0);
    setStatus("Ready to start");
    setGps("Waiting for GPS");
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f3f6fb",
      color: "#17243a",
      fontFamily: "Arial, sans-serif",
      padding: "28px 16px"
    }}>
      <div style={{ maxWidth: 1100, margin: "auto" }}>

        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 28
        }}>
          <div>
            <div style={{
              color: "#2563eb",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2
            }}>ROADSENSE / LIVE MONITOR</div>
            <h1 style={{ margin: "8px 0", fontSize: 30 }}>
              Pothole Detection
            </h1>
            <p style={{ color: "#64748b", margin: 0 }}>
              Real-time road monitoring and damage analysis
            </p>
          </div>

          <div style={{
            background: active ? "#dcfce7" : "#e2e8f0",
            color: active ? "#166534" : "#475569",
            padding: "10px 16px",
            borderRadius: 30,
            fontWeight: 700,
            fontSize: 13
          }}>
            {active ? "● LIVE" : "● OFFLINE"}
          </div>
        </header>

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginBottom: 22
        }}>
          {[
            { label: "Segment Distance", value: `${meters} / 10 m`, icon: "↔" },
            { label: "Potholes Detected", value: count, icon: "⚠" },
            { label: "Segments Analysed", value: segments, icon: "▦" }
          ].map(item => (
            <div key={item.label} style={{
              background: "white",
              padding: 22,
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 16px #0f172a08"
            }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>
                {item.icon} &nbsp; {item.label}
              </div>
              <div style={{
                fontSize: 27,
                fontWeight: 700,
                marginTop: 12
              }}>{item.value}</div>
            </div>
          ))}
        </section>

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 22
        }}>
          <div style={{
            background: "white",
            padding: 18,
            borderRadius: 18,
            border: "1px solid #e2e8f0"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14
            }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Camera Feed</h2>
              <span style={{ color: active ? "#16a34a" : "#64748b" }}>
                {active ? "Streaming" : "Stopped"}
              </span>
            </div>

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
                background: "#0f172a",
                borderRadius: 12
              }}
            />
            <canvas ref={canvas} style={{ display: "none" }} />

            <div style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 18
            }}>
              <button disabled={active} onClick={start} style={{
                flex: 1,
                padding: 13,
                border: 0,
                borderRadius: 10,
                background: active ? "#94a3b8" : "#2563eb",
                color: "white",
                fontWeight: 700,
                cursor: active ? "not-allowed" : "pointer"
              }}>▶ Start</button>

              <button disabled={!active} onClick={stop} style={{
                flex: 1,
                padding: 13,
                border: 0,
                borderRadius: 10,
                background: !active ? "#cbd5e1" : "#dc2626",
                color: "white",
                fontWeight: 700,
                cursor: !active ? "not-allowed" : "pointer"
              }}>■ Stop</button>

              <button onClick={reset} style={{
                padding: "13px 18px",
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                background: "white",
                color: "#334155",
                fontWeight: 700,
                cursor: "pointer"
              }}>Reset</button>
            </div>
          </div>

          <div style={{
            background: "white",
            padding: 22,
            borderRadius: 18,
            border: "1px solid #e2e8f0"
          }}>
            <h2 style={{ fontSize: 17, marginTop: 0 }}>
              Monitoring Status
            </h2>

            <div style={{
              background: "#f8fafc",
              borderRadius: 12,
              padding: 16,
              marginBottom: 18
            }}>
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Current activity
              </div>
              <p style={{ fontWeight: 700, marginBottom: 0 }}>{status}</p>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 9,
                fontSize: 14
              }}>
                <span>Segment progress</span>
                <b>{Math.min(meters * 10, 100)}%</b>
              </div>
              <div style={{
                height: 9,
                background: "#e2e8f0",
                borderRadius: 10,
                overflow: "hidden"
              }}>
                <div style={{
                  width: `${Math.min(meters * 10, 100)}%`,
                  height: "100%",
                  background: "#2563eb",
                  transition: "width .2s"
                }} />
              </div>
            </div>

            <div style={{
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              marginBottom: 18
            }}>
              <div style={{ color: "#64748b", fontSize: 13 }}>
                GPS coordinates
              </div>
              <p style={{
                fontWeight: 600,
                overflowWrap: "anywhere",
                marginBottom: 0
              }}>{gps}</p>
            </div>

            <div style={{
              padding: 16,
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1e40af",
              fontSize: 14,
              lineHeight: 1.6
            }}>
              <b>How it works</b>
              <p style={{ marginBottom: 0 }}>
                Frames are sampled every second. After each 10 metres
                of GPS distance, a batch is sent to FastAPI for
                pothole detection and local result storage.
              </p>
            </div>
          </div>
        </section>

        <footer style={{
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 12,
          marginTop: 26
        }}>
          RoadSense · Local ML Inference · FastAPI + YOLO
        </footer>
      </div>
    </main>
  );
}
