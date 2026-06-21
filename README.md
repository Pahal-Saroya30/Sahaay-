# Sahaay -- Event-Driven Congestion Impact Forecaster

Forecasts the traffic impact of planned & unplanned events (rallies, festivals,
construction, breakdowns, accidents, etc.) and recommends manpower, barricading,
and diversion plans, using Bengaluru Traffic Police historical event data.

## Run it
```bash
pip install -r requirements.txt
python app.py
```
(Starts the Uvicorn web server at http://localhost:8000 -- open this in your browser.)

## Structure
- `app.py` -- FastAPI server serving the custom HTML5/CSS/JS dashboard
- `static/` -- custom dark-theme frontend assets (index.html, styles.css, app.js)
- `engine.py` -- prediction + recommendation engine (the core logic)
- `model/train.py` -- trains the duration & road-closure-likelihood models
- `model/*.joblib` -- pre-trained models, ready to use immediately
- `data/` -- cleaned modeling dataset + historical aggregate tables

## Why no model was trained on the dataset's `priority` field
EDA showed `priority` is a near-deterministic proxy for "named corridor vs not"
(see the app's "About" tab for the exact numbers) rather than genuine severity judgement.
We engineer a transparent Severity Index instead -- see `engine.py`.
