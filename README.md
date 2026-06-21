# Sahaay -- Event-Driven Congestion Impact Forecaster

Forecasts the traffic impact of planned & unplanned events (rallies, festivals,
construction, breakdowns, accidents, etc.) and recommends manpower, barricading,
and diversion plans, using Bengaluru Traffic Police historical event data.

**Forecast. Optimize. Divert. Learn.**

Sahaay is an AI-powered traffic management platform designed to help authorities proactively handle congestion caused by planned and unplanned events such as political rallies, festivals, sporting events, construction activities, and large public gatherings.

By leveraging historical traffic records, real-time traffic conditions, event characteristics, and external factors, Sahaay predicts congestion before it occurs and provides actionable recommendations for manpower deployment, barricade placement, and traffic diversion planning.

---

## 🌟 Problem Statement

Large-scale events often create localized traffic breakdowns that are difficult to manage using traditional approaches. Current traffic management systems largely rely on experience-based planning, resulting in delayed responses, inefficient resource utilization, and recurring congestion issues.

Sahaay addresses this challenge by transforming traffic management from a reactive process into a predictive and data-driven decision-making system.

---

## 🎯 Key Features

### 📈 Congestion Forecasting

Predicts traffic impact and identifies high-risk zones before congestion develops.

### 👮 Resource Optimization

Recommends optimal deployment of traffic personnel, barricades, and control points.

### 🛣️ Diversion Planning

Suggests alternative routes to minimize bottlenecks and maintain smoother traffic flow.

### 🧠 Continuous Learning

Compares predictions with actual outcomes to improve future recommendations.

### 📊 Interactive Dashboard

Provides authorities with a centralized view of traffic insights and operational recommendations.

---

## ⚙️ How It Works

Event Data
⬇️

Traffic & Historical Data
⬇️

Congestion Prediction Engine
⬇️

Resource Optimization Engine
⬇️

Diversion Recommendation System
⬇️

Actionable Traffic Management Insights

---

## 📊 Dataset Insights

Analysis of historical traffic incidents revealed several important patterns:

* Vehicle breakdowns contribute to a significant share of disruptions.
* The majority of incidents are unplanned, highlighting the need for predictive intelligence.
* A relatively small number of events create the highest operational burden through road closures and traffic diversions.
* Historical patterns can be leveraged to optimize future traffic management strategies.

---

## 🚀 Impact

✅ Faster operational planning

✅ Improved resource utilization

✅ Reduced traffic disruptions

✅ Data-driven decision making

✅ Continuous system improvement

---

## 🔮 Future Scope

* Smart City Integration
* Emergency Vehicle Prioritization
* Crowd Movement Prediction
* Adaptive Traffic Signal Control
* Real-Time Urban Mobility Intelligence

---

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



### Building Smarter Cities Through Proactive Traffic Intelligence 🚦
