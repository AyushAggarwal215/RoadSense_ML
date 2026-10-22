
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# pyrefly: ignore[missing-import]
from ultralytics import YOLO
from pathlib import Path
from datetime import datetime, timezone
import base64
import cv2
import numpy as np
import json

app = FastAPI(title="Pothole Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Keep predict.pt in the same folder as main.py
MODEL_PATH = Path(__file__).parent / "predict.pt"
RESULTS_PATH = Path(__file__).parent / "detections.jsonl"

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

model = YOLO(str(MODEL_PATH))


class FrameRequest(BaseModel):
    frame: str
    location: dict


@app.get("/")
def home():
    return {"message": "Pothole Detection API is running"}


@app.post("/detect-frame")
def detect_frame(data: FrameRequest):
    try:
        # Decode the image sent by Next.js
        image_bytes = base64.b64decode(data.frame.split(",")[-1])

        image = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR
        )

        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image")

        # Run your ML model
        result = model.predict(image, verbose=False)[0]

        detections = []

        for box in result.boxes:
            class_id = int(box.cls[0])
            class_name = result.names[class_id]

            detections.append({
                "class": class_name,
                "confidence": round(float(box.conf[0]), 3),
                "box": [
                    round(float(x), 1)
                    for x in box.xyxy[0].tolist()
                ]
            })

        # Count classes whose names contain 'pothole'
        pothole_count = sum(
            1 for item in detections
            if "pothole" in item["class"].lower()
        )

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "location": data.location,
            "pothole_count": pothole_count,
            "detections": detections
        }

        # Append one JSON record per frame
        with RESULTS_PATH.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record) + "\n")

        return record

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
