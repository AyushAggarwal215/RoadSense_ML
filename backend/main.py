
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import base64
import cv2
import numpy as np
import json
from pathlib import Path
from datetime import datetime, timezone

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = YOLO("predict.pt")
RESULTS = Path("detections.jsonl")


class Segment(BaseModel):
    frames: list[str]
    start: dict
    end: dict
    distance_m: float


@app.get("/")
def home():
    return {"message": "Pothole detection API running"}


@app.post("/detect")
def detect(data: Segment):
    detections = []

    for i, frame in enumerate(data.frames):
        image_bytes = base64.b64decode(frame.split(",")[-1])
        image = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR
        )

        if image is None:
            continue

        result = model.predict(image, verbose=False)[0]

        for box in result.boxes:
            detections.append({
                "frame": i,
                "class": result.names[int(box.cls[0])],
                "confidence": round(float(box.conf[0]), 3),
                "box": [round(float(x), 1) for x in box.xyxy[0]]
            })

    record = {
        "time": datetime.now(timezone.utc).isoformat(),
        "distance_m": data.distance_m,
        "start": data.start,
        "end": data.end,
        "frames_processed": len(data.frames),
        "pothole_count": sum(
            1 for d in detections
            if "pothole" in d["class"].lower()
        ),
        "detections": detections
    }

    with RESULTS.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record) + "\n")

    return record
