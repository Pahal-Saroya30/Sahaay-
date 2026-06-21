import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd
from datetime import datetime
from pathlib import Path

from engine import predict_impact, reload_models, CORRIDORS, EVENT_CAUSES, PLANNED_CAUSES, CORRIDOR_CENTROIDS, corridor_stats, historical_agg
from model.train import train_models

app = FastAPI()

ROOT = Path(__file__).resolve().parent
FEEDBACK_PATH = ROOT / 'data' / 'feedback_log.csv'

# Create static directory if it doesn't exist
static_dir = ROOT / "static"
static_dir.mkdir(parents=True, exist_ok=True)

# Mount static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

class PredictRequest(BaseModel):
    event_type: str
    event_cause: str
    corridor: str
    requires_road_closure: bool
    event_date: str  # YYYY-MM-DD
    event_time: str  # HH:MM

class FeedbackRequest(BaseModel):
    event_type: str
    event_cause: str
    corridor: str
    requires_road_closure: bool
    hour: int
    dayofweek: int
    month: int
    actual_duration_min: float
    actual_road_closure: bool
    manpower_used: int
    notes: str = ""

@app.get("/")
def get_index():
    return FileResponse(os.path.join(ROOT, "static", "index.html"))

@app.get("/favicon.ico", include_in_schema=False)
def get_favicon():
    return FileResponse(os.path.join(ROOT, "static", "favicon.svg"))

@app.get("/api/config")
def get_config():
    return {
        "corridors": CORRIDORS + ["Non-corridor"],
        "causes": EVENT_CAUSES,
        "planned_causes": list(PLANNED_CAUSES),
        "centroids": CORRIDOR_CENTROIDS
    }

@app.post("/api/predict")
def api_predict(req: PredictRequest):
    try:
        dt_date = datetime.strptime(req.event_date, "%Y-%m-%d")
        dt_time = datetime.strptime(req.event_time, "%H:%M")
        
        hour = dt_time.hour
        dayofweek = dt_date.weekday()
        month = dt_date.month
        
        res = predict_impact(
            req.event_type,
            req.event_cause,
            req.corridor,
            req.requires_road_closure,
            hour,
            dayofweek,
            month
        )
        res["inputs"] = {
            "event_type": req.event_type,
            "event_cause": req.event_cause,
            "corridor": req.corridor,
            "requires_road_closure": req.requires_road_closure,
            "hour": hour,
            "dayofweek": dayofweek,
            "month": month
        }
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/feedback")
def api_feedback(req: FeedbackRequest):
    # Validate input ranges to prevent data poisoning and retraining pipeline crashes
    if req.actual_duration_min <= 0:
        raise HTTPException(status_code=400, detail="Actual duration must be greater than 0 minutes.")
    if req.manpower_used < 0:
        raise HTTPException(status_code=400, detail="Personnel deployed cannot be negative.")
    if not (0 <= req.hour <= 23):
        raise HTTPException(status_code=400, detail="Hour must be between 0 and 23.")
    if not (0 <= req.dayofweek <= 6):
        raise HTTPException(status_code=400, detail="Day of week must be between 0 (Monday) and 6 (Sunday).")
    if not (1 <= req.month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12.")

    try:
        row = {
            "event_type": req.event_type,
            "event_cause": req.event_cause,
            "corridor": req.corridor,
            "requires_road_closure": int(req.requires_road_closure),
            "hour": req.hour,
            "dayofweek": req.dayofweek,
            "is_weekend": int(req.dayofweek in (5, 6)),
            "month": req.month,
            "actual_duration_min": req.actual_duration_min,
            "actual_road_closure": int(req.actual_road_closure),
            "manpower_used": req.manpower_used,
            "notes": req.notes,
            "logged_at": datetime.now().isoformat()
        }
        
        FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
        if FEEDBACK_PATH.exists():
            fb = pd.read_csv(FEEDBACK_PATH)
            fb = pd.concat([fb, pd.DataFrame([row])], ignore_index=True)
        else:
            fb = pd.DataFrame([row])
        fb.to_csv(FEEDBACK_PATH, index=False)
        return {"status": "success", "message": "Feedback logged successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def api_stats():
    try:
        cdf = corridor_stats.reset_index().fillna("").to_dict(orient="records")
        hagg = historical_agg.fillna("").to_dict(orient="records")
        
        feedback_logs = []
        n_fb = 0
        avg_dur = 0.0
        
        if FEEDBACK_PATH.exists():
            fb_df = pd.read_csv(FEEDBACK_PATH).fillna("")
            n_fb = len(fb_df)
            if n_fb > 0:
                avg_dur = float(fb_df["actual_duration_min"].mean())
                feedback_logs = fb_df.to_dict(orient="records")
                
        return {
            "n_feedback": n_fb,
            "avg_feedback_duration": round(avg_dur, 1),
            "feedback_logs": feedback_logs,
            "corridor_stats": cdf,
            "historical_agg": hagg,
            "validation_metrics": {
                "r2": 0.3373,
                "mae": 1.2097,
                "accuracy": 0.8766,
                "f1": 0.4397
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/retrain")
def api_retrain():
    try:
        fb_count, r2, mae, acc, f1 = train_models(ROOT)
        reload_models()
        return {
            "status": "success",
            "retrained_count": fb_count,
            "r2": round(r2, 4),
            "mae": round(mae, 4),
            "accuracy": round(acc, 4),
            "f1": round(f1, 4)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
