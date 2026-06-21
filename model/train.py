"""
Train Sahaay's prediction models from historical event data and logged feedback.
Run from project root: python model/train.py
"""
import pandas as pd, numpy as np, joblib
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import mean_absolute_error, r2_score, accuracy_score, f1_score

CORRIDOR_CENTROIDS = {
    'Airport New South Road': (13.027519, 77.633527),
    'Bannerghata Road': (12.896377, 77.597880),
    'Bellary Road 1': (13.016800, 77.586404),
    'Bellary Road 2': (13.105956, 77.603271),
    'CBD 1': (12.981023, 77.606815),
    'CBD 2': (12.983312, 77.595046),
    'Hennur Main Road': (13.051147, 77.626191),
    'Hosur Road': (12.915473, 77.624664),
    'IRR(Thanisandra road)': (12.937506, 77.626945),
    'Magadi Road': (12.985060, 77.523344),
    'Mysore Road': (12.957790, 77.563652),
    'Non-corridor': (12.982861, 77.598694),
    'ORR East 1': (12.928305, 77.669131),
    'ORR East 2': (12.975835, 77.696026),
    'ORR North 1': (13.024549, 77.637439),
    'ORR North 2': (13.041928, 77.558822),
    'ORR West 1': (12.920839, 77.559128),
    'Old Airport Road': (12.958868, 77.661845),
    'Old Madras Road': (12.980913, 77.629323),
    'Tumkur Road': (13.031459, 77.533663),
    'Varthur Road': (12.956553, 77.715936),
    'West of Chord Road': (12.982972, 77.546340),
}

def train_models(root_dir=None):
    if root_dir is None:
        root_dir = Path(__file__).resolve().parent.parent
    else:
        root_dir = Path(root_dir)
        
    # Ensure model and data output directories exist to prevent write failures
    (root_dir / 'model').mkdir(parents=True, exist_ok=True)
    (root_dir / 'data').mkdir(parents=True, exist_ok=True)
        
    df = pd.read_csv(root_dir / 'data' / 'model_ready.csv')
    
    # Calculate cyclical time features for core training data
    df['sin_hour'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['cos_hour'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['sin_day'] = np.sin(2 * np.pi * df['dayofweek'] / 7)
    df['cos_day'] = np.cos(2 * np.pi * df['dayofweek'] / 7)
    df['sin_month'] = np.sin(2 * np.pi * df['month'] / 12)
    df['cos_month'] = np.cos(2 * np.pi * df['month'] / 12)
    
    # Load feedback log data and merge
    feedback_path = root_dir / 'data' / 'feedback_log.csv'
    feedback_merged_count = 0
    if feedback_path.exists():
        try:
            fb = pd.read_csv(feedback_path)
            if len(fb) > 0:
                # Ensure all necessary columns exist and are sanitized
                fb['hour'] = fb['hour'].fillna(12).astype(int)
                fb['dayofweek'] = fb['dayofweek'].fillna(0).astype(int)
                fb['is_weekend'] = fb['dayofweek'].apply(lambda d: 1 if int(d) in (5, 6) else 0)
                fb['month'] = fb['month'].fillna(1).astype(int)
                fb['actual_road_closure'] = fb['actual_road_closure'].fillna(0).astype(int)
                fb['actual_duration_min'] = fb['actual_duration_min'].fillna(30.0).astype(float)
                
                # Fetch geocoordinates dynamically for feedback logs
                fb['latitude'] = fb['corridor'].apply(lambda c: CORRIDOR_CENTROIDS.get(c, CORRIDOR_CENTROIDS['Non-corridor'])[0])
                fb['longitude'] = fb['corridor'].apply(lambda c: CORRIDOR_CENTROIDS.get(c, CORRIDOR_CENTROIDS['Non-corridor'])[1])
                
                # Compute cyclical representations for feedback logs
                fb['sin_hour'] = np.sin(2 * np.pi * fb['hour'] / 24)
                fb['cos_hour'] = np.cos(2 * np.pi * fb['hour'] / 24)
                fb['sin_day'] = np.sin(2 * np.pi * fb['dayofweek'] / 7)
                fb['cos_day'] = np.cos(2 * np.pi * fb['dayofweek'] / 7)
                fb['sin_month'] = np.sin(2 * np.pi * fb['month'] / 12)
                fb['cos_month'] = np.cos(2 * np.pi * fb['month'] / 12)
                
                fb_mapped = pd.DataFrame({
                    'event_type': fb['event_type'],
                    'event_cause': fb['event_cause'],
                    'corridor': fb['corridor'],
                    'hour': fb['hour'],
                    'dayofweek': fb['dayofweek'],
                    'is_weekend': fb['is_weekend'],
                    'month': fb['month'],
                    'sin_hour': fb['sin_hour'],
                    'cos_hour': fb['cos_hour'],
                    'sin_day': fb['sin_day'],
                    'cos_day': fb['cos_day'],
                    'sin_month': fb['sin_month'],
                    'cos_month': fb['cos_month'],
                    'latitude': fb['latitude'],
                    'longitude': fb['longitude'],
                    'requires_road_closure': fb['actual_road_closure'],
                    'duration_min': fb['actual_duration_min']
                })
                df = pd.concat([df, fb_mapped], ignore_index=True)
                feedback_merged_count = len(fb_mapped)
                print(f"Loaded and merged {feedback_merged_count} feedback entries into training dataset.")
        except Exception as e:
            print(f"Warning: Could not merge feedback log: {e}")
 
    cat_features = ['event_type', 'event_cause', 'corridor']
    num_features = ['hour', 'dayofweek', 'is_weekend', 'month', 'sin_hour', 'cos_hour', 'sin_day', 'cos_day', 'sin_month', 'cos_month', 'latitude', 'longitude']
    bool_features = ['requires_road_closure']
 
    X = df[cat_features + num_features + bool_features].copy()
    X['requires_road_closure'] = X['requires_road_closure'].astype(int)
 
    # ---------- Duration regression ----------
    y_dur = np.log1p(df['duration_min'])
 
    pre = ColumnTransformer([('cat', OneHotEncoder(handle_unknown='ignore'), cat_features)], remainder='passthrough')
    dur_pipe = Pipeline([
        ('pre', pre),
        ('rf', RandomForestRegressor(n_estimators=200, max_depth=12, min_samples_leaf=2, min_samples_split=2, random_state=42))
    ])
 
    Xtr, Xte, ytr, yte = train_test_split(X, y_dur, test_size=0.2, random_state=42)
    dur_pipe.fit(Xtr, ytr)
    pred = dur_pipe.predict(Xte)
    r2 = r2_score(yte, pred)
    mae = mean_absolute_error(yte, pred)
    print("Duration model -- R2:", r2, "MAE (log-min):", mae)
 
    dur_pipe.fit(X, y_dur)
    joblib.dump(dur_pipe, root_dir / 'model' / 'duration_model.joblib')
 
    # ---------- Road-closure likelihood ----------
    y_rc = df['requires_road_closure'].astype(int)
    X_rc = df[cat_features + num_features].copy()
 
    pre3 = ColumnTransformer([('cat', OneHotEncoder(handle_unknown='ignore'), cat_features)], remainder='passthrough')
    rc_pipe = Pipeline([
        ('pre', pre3),
        ('rf', RandomForestClassifier(n_estimators=200, max_depth=10, min_samples_leaf=5, min_samples_split=2,
                                        class_weight='balanced', random_state=42))
    ])
    Xtr3, Xte3, ytr3, yte3 = train_test_split(X_rc, y_rc, test_size=0.2, random_state=42, stratify=y_rc)
    rc_pipe.fit(Xtr3, ytr3)
    pred3 = rc_pipe.predict(Xte3)
    acc = accuracy_score(yte3, pred3)
    f1 = f1_score(yte3, pred3)
    print("Road-closure model -- Accuracy:", acc, "F1:", f1)
 
    rc_pipe.fit(X_rc, y_rc)
    joblib.dump(rc_pipe, root_dir / 'model' / 'closure_model.joblib')
 
    print("All models successfully saved to model/")
    return feedback_merged_count, r2, mae, acc, f1

if __name__ == '__main__':
    train_models()
