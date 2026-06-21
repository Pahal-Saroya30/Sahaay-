// Sahaay Web Application Logic -- Command Deck Overhaul

let centroids = {};
let lastInputState = null;
let basePredictedDuration = 60; // baseline for simulator

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ==========================================================================
// TACTICAL VECTOR COORDINATE CONTROLLER (VectorPad)
// ==========================================================================

const vectorPadState = {
    isActive: false,
    isLocked: false,
    isDragging: false,
    needsFinalSnap: false,
    targetX: 50,
    targetY: 50,
    smoothX: 50,
    smoothY: 50,
    vx: 0,
    vy: 0
};

const BENGALURU_COORDS = {
    latMin: 12.87,
    latMax: 13.13,
    lngMin: 77.50,
    lngMax: 77.74
};

function updateVectorPadPositionForCorridor(corr) {
    if (!centroids || !centroids[corr]) return;
    const pt = centroids[corr];
    const lat = pt[0];
    const lng = pt[1];
    
    const xPct = Math.min(Math.max(((lng - BENGALURU_COORDS.lngMin) / (BENGALURU_COORDS.lngMax - BENGALURU_COORDS.lngMin)) * 100, 0), 100);
    const yPct = Math.min(Math.max(((BENGALURU_COORDS.latMax - lat) / (BENGALURU_COORDS.latMax - BENGALURU_COORDS.latMin)) * 100, 0), 100);
    
    if (!vectorPadState.isActive) {
        vectorPadState.targetX = xPct;
        vectorPadState.targetY = yPct;
    }
}

function handleVectorPadMove(xPct, yPct) {
    const lng = BENGALURU_COORDS.lngMin + (xPct / 100) * (BENGALURU_COORDS.lngMax - BENGALURU_COORDS.lngMin);
    const lat = BENGALURU_COORDS.latMax - (yPct / 100) * (BENGALURU_COORDS.latMax - BENGALURU_COORDS.latMin);
    
    let closestCorr = null;
    let minDistance = Infinity;
    
    for (let name in centroids) {
        if (name === "Non-corridor") continue;
        const pt = centroids[name];
        const dist = Math.pow(pt[0] - lat, 2) + Math.pow(pt[1] - lng, 2);
        if (dist < minDistance) {
            minDistance = dist;
            closestCorr = name;
        }
    }
    
    if (closestCorr) {
        const corridorSelect = document.getElementById("corridor");
        if (corridorSelect && corridorSelect.value !== closestCorr) {
            corridorSelect.value = closestCorr;
            corridorSelect.dispatchEvent(new Event("change"));
            logConsole(`HUD Vector grid selector snapped to: ${closestCorr}`, "system");
        }
    }
}

function initVectorPad() {
    const container = document.querySelector(".vector-pad-outer");
    const canvas = document.getElementById("vector-pad-canvas");
    const valX = document.getElementById("vp-val-x");
    const valY = document.getElementById("vp-val-y");
    const stateLabel = document.getElementById("vp-state");
    const seekingText = document.getElementById("vp-seeking-text");
    
    if (!canvas || !container) return;
    
    // Performance optimization cache to prevent DOM layout thrashing
    let prevSmoothX = -1;
    let prevSmoothY = -1;
    let prevTiltX = -999;
    let prevTiltY = -999;
    
    const updateVisuals = () => {
        const currentSmoothX = vectorPadState.smoothX;
        const currentSmoothY = vectorPadState.smoothY;
        const tiltX = vectorPadState.vy * 0.4;
        const tiltY = vectorPadState.vx * 0.4;
        
        if (Math.abs(currentSmoothX - prevSmoothX) > 0.01) {
            canvas.style.setProperty("--crosshair-x", `${currentSmoothX}%`);
            prevSmoothX = currentSmoothX;
            if (valX) valX.textContent = Math.round(currentSmoothX).toString().padStart(3, '0');
        }
        if (Math.abs(currentSmoothY - prevSmoothY) > 0.01) {
            canvas.style.setProperty("--crosshair-y", `${currentSmoothY}%`);
            prevSmoothY = currentSmoothY;
            if (valY) valY.textContent = Math.round(currentSmoothY).toString().padStart(3, '0');
        }
        if (Math.abs(tiltX - prevTiltX) > 0.01) {
            canvas.style.setProperty("--tilt-x", `${tiltX}deg`);
            prevTiltX = tiltX;
        }
        if (Math.abs(tiltY - prevTiltY) > 0.01) {
            canvas.style.setProperty("--tilt-y", `${tiltY}deg`);
            prevTiltY = tiltY;
        }
    };
    
    const stiffness = 220;
    const damping = 22;
    let lastTime = performance.now();
    
    const animateSpring = (time) => {
        let dt = (time - lastTime) / 1000;
        lastTime = time;
        
        if (dt > 0.1) dt = 0.1;
        
        const ax = -stiffness * (vectorPadState.smoothX - vectorPadState.targetX) - damping * vectorPadState.vx;
        const ay = -stiffness * (vectorPadState.smoothY - vectorPadState.targetY) - damping * vectorPadState.vy;
        
        vectorPadState.vx += ax * dt;
        vectorPadState.vy += ay * dt;
        
        vectorPadState.smoothX += vectorPadState.vx * dt;
        vectorPadState.smoothY += vectorPadState.vy * dt;
        
        vectorPadState.smoothX = Math.min(Math.max(vectorPadState.smoothX, 0), 100);
        vectorPadState.smoothY = Math.min(Math.max(vectorPadState.smoothY, 0), 100);
        
        updateVisuals();
        
        const isMoving = Math.abs(vectorPadState.vx) > 0.01 || Math.abs(vectorPadState.vy) > 0.01;
        if (vectorPadState.isActive && (isMoving || vectorPadState.needsFinalSnap)) {
            handleVectorPadMove(vectorPadState.smoothX, vectorPadState.smoothY);
            if (!isMoving) {
                vectorPadState.needsFinalSnap = false;
            }
        }
        
        requestAnimationFrame(animateSpring);
    };
    
    requestAnimationFrame(animateSpring);
    
    canvas.addEventListener("pointerenter", () => {
        vectorPadState.isActive = true;
        container.classList.add("active");
        stateLabel.textContent = vectorPadState.isLocked ? "LOCKED" : "TRACKING";
    });
    
    canvas.addEventListener("pointerleave", () => {
        vectorPadState.isActive = false;
        vectorPadState.isLocked = false;
        vectorPadState.isDragging = false;
        container.classList.remove("active", "locked");
        stateLabel.textContent = "IDLE";
        if (seekingText) seekingText.textContent = "SEEKING...";
        
        const corridorSelect = document.getElementById("corridor");
        if (corridorSelect && corridorSelect.value) {
            updateVectorPadPositionForCorridor(corridorSelect.value);
            drawMap(corridorSelect.value, centroids, true); // final camera pan/zoom lock
        } else {
            vectorPadState.targetX = 50;
            vectorPadState.targetY = 50;
        }
    });
    
    canvas.addEventListener("pointerdown", (e) => {
        canvas.setPointerCapture(e.pointerId);
        vectorPadState.isLocked = true;
        vectorPadState.isDragging = true;
        container.classList.add("locked");
        stateLabel.textContent = "LOCKED";
        if (seekingText) seekingText.textContent = "TARGET_ACQUIRED";
        
        updateTargetFromEvent(e);
    });
    
    canvas.addEventListener("pointerup", (e) => {
        canvas.releasePointerCapture(e.pointerId);
        vectorPadState.isLocked = false;
        vectorPadState.isDragging = false;
        container.classList.remove("locked");
        stateLabel.textContent = "TRACKING";
        if (seekingText) seekingText.textContent = "SEEKING...";
        
        const corridorSelect = document.getElementById("corridor");
        if (corridorSelect && corridorSelect.value) {
            drawMap(corridorSelect.value, centroids, true); // final camera pan/zoom lock
        }
    });
    
    canvas.addEventListener("pointermove", (e) => {
        if (vectorPadState.isActive) {
            updateTargetFromEvent(e);
        }
    });
    
    function updateTargetFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        vectorPadState.targetX = Math.min(Math.max(x, 0), 100);
        vectorPadState.targetY = Math.min(Math.max(y, 0), 100);
        vectorPadState.needsFinalSnap = true;
    }
}

// 3D Interactive Tilt & Glare Card Helper
function initInteractiveTilt(selector, options = {}) {
    const cards = document.querySelectorAll(selector);
    const tiltFactor = options.tiltFactor !== undefined ? options.tiltFactor : 15;
    const hoverScale = options.hoverScale !== undefined ? options.hoverScale : 1.05;
    const glareIntensity = options.glareIntensity !== undefined ? options.glareIntensity : 0.3;
    const glareSize = options.glareSize !== undefined ? options.glareSize : 80;
    const perspective = options.perspective !== undefined ? options.perspective : 1000;
    
    cards.forEach(card => {
        let glare = card.querySelector(".card-glare-overlay");
        if (!glare) {
            glare = document.createElement("div");
            glare.className = "card-glare-overlay";
            card.appendChild(glare);
        }
        
        card.addEventListener("pointermove", (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            
            const tiltX = -(y * tiltFactor);
            const tiltY = x * tiltFactor;
            
            card.style.transform = `perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${hoverScale})`;
            
            const glareX = (x * 0.5 + 0.5) * 100;
            const glareY = (y * 0.5 + 0.5) * 100;
            
            glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, ${glareIntensity}) 0%, rgba(255, 255, 255, 0) ${glareSize}%)`;
            glare.style.opacity = 1;
        });
        
        card.addEventListener("pointerenter", () => {
            card.style.transition = "none";
            glare.style.transition = "none";
        });
        
        card.addEventListener("pointerleave", () => {
            card.style.transition = "transform 0.3s ease, box-shadow 0.3s ease";
            glare.style.transition = "opacity 0.3s ease";
            card.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale(1)`;
            glare.style.opacity = 0;
        });
    });
}

// Sleek Telemetry Ticker Logger
function logConsole(message, type = "system") {
    const ticker = document.getElementById("telemetry-ticker");
    if (ticker) {
        // Reset and trigger CSS fade animation
        ticker.style.animation = 'none';
        ticker.offsetHeight; /* trigger reflow */
        ticker.style.animation = null;
        
        ticker.textContent = message;
        
        // Color ticker text depending on system event priority
        if (type === "error") {
            ticker.style.color = "var(--color-high)";
        } else if (type === "success") {
            ticker.style.color = "#5cbf86";
        } else if (type === "warning") {
            ticker.style.color = "var(--color-medium)";
        } else {
            ticker.style.color = "var(--text-secondary)";
        }
    }
}

// Animated number counter
function animateValue(elementId, start, end, duration, suffix = "") {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    if (isNaN(end)) {
        obj.textContent = end + suffix;
        return;
    }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const val = progress * (end - start) + start;
        
        if (Number.isInteger(end)) {
            obj.textContent = `${Math.floor(val)}${suffix}`;
        } else {
            obj.textContent = `${val.toFixed(1)}${suffix}`;
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// SVG Severity Ring Animation
function updateSeverityRing(score) {
    const ring = document.getElementById("severity-ring-path");
    const bandLabel = document.getElementById("res-severity-band");
    if (!ring) return;
    
    const val = Math.min(Math.max(score, 0), 100);
    // stroke-dasharray has circumference 100
    ring.style.strokeDasharray = `${val}, 100`;
    
    // Dynamic color coding based on threshold
    let color = "var(--color-low)";
    let band = "LOW";
    if (val >= 25 && val < 50) {
        color = "var(--color-medium)";
        band = "MEDIUM";
    } else if (val >= 50) {
        color = "var(--color-high)";
        band = "HIGH";
    }
    ring.style.stroke = color;
    if (bandLabel) {
        bandLabel.textContent = band;
        bandLabel.className = `severity-band-label ${band.toLowerCase()}`;
    }
}

// Global Leaflet map objects
let map;
let tileLayer;
let baseMarkers = [];
let activeCircle = null;
let activeMarker = null;
let diversionLines = [];
let latestForecastResult = null;

function initLeafletMap(centroids) {
    if (map) return;
    
    // Default focus on Central Bengaluru
    map = L.map('leaflet-map', {
        center: [12.9715987, 77.5945627],
        zoom: 12,
        zoomControl: true,
        attributionControl: true
    });
    
    updateMapTiles();
    drawInitialCorridors(centroids);
}

function updateMapTiles() {
    if (!map) return;
    if (tileLayer) {
        map.removeLayer(tileLayer);
    }
    
    const isLight = document.body.getAttribute("data-theme") === "light";
    const url = isLight 
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    
    tileLayer = L.tileLayer(url, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

function drawInitialCorridors(centroids) {
    if (!map) return;
    
    // Clear old base markers
    baseMarkers.forEach(m => map.removeLayer(m));
    baseMarkers = [];
    
    for (let name in centroids) {
        if (name === "Non-corridor") continue;
        const pt = centroids[name];
        
        // Custom theme-sensitive marker
        const otherIcon = L.divIcon({
            className: 'other-marker-wrapper',
            html: `<div style="width:10px;height:10px;background:var(--accent-color);border:2px solid var(--text-primary);border-radius:50%;cursor:pointer;box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });
        
        const marker = L.marker([pt[0], pt[1]], { icon: otherIcon }).addTo(map);
        marker.bindTooltip(name, { direction: 'top' });
        
        marker.on('click', () => {
            const corridorSelect = document.getElementById("corridor");
            if (corridorSelect) {
                corridorSelect.value = name;
                corridorSelect.dispatchEvent(new Event("change"));
                logConsole(`GIS Map selected corridor: ${name}`, "system");
            }
        });
        
        baseMarkers.push(marker);
    }
}

function drawMap(corridor, centroids, forcePan = false) {
    if (!map) return;
    
    // Performance optimization: skip heavy map redrawing while dragging/tracking the reticle on VectorPad
    if (vectorPadState.isActive && !forcePan) return;
    if (activeMarker) {
        map.removeLayer(activeMarker);
        activeMarker = null;
    }
    if (activeCircle) {
        map.removeLayer(activeCircle);
        activeCircle = null;
    }
    
    // Remove existing diversion lines
    if (diversionLines) {
        diversionLines.forEach(l => map.removeLayer(l));
    }
    diversionLines = [];
    
    if (corridor === "Non-corridor" || !centroids[corridor]) {
        if (forcePan || (!vectorPadState.isActive && !vectorPadState.isLocked)) {
            map.setView([12.9715987, 77.5945627], 12);
        }
        return;
    }
    
    const pt = centroids[corridor];
    
    // Add dynamic pulsing ping marker
    const activeIcon = L.divIcon({
        className: 'pulsing-marker-wrapper',
        html: '<div class="pulsing-marker"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
    
    activeMarker = L.marker([pt[0], pt[1]], { icon: activeIcon }).addTo(map);
    activeMarker.bindTooltip(`<b>ACTIVE INCIDENT</b><br>${corridor}`, { direction: 'top', permanent: true });
    
    // Add dynamic severity circular zone
    const severityScore = parseFloat(document.getElementById("res-severity-score")?.textContent) || 0;
    const durationMin = parseFloat(document.getElementById("res-duration")?.textContent) || 45;
    
    let circleColor = "var(--color-low)";
    if (severityScore >= 25 && severityScore < 50) {
        circleColor = "var(--color-medium)";
    } else if (severityScore >= 50) {
        circleColor = "var(--color-high)";
    }
    
    activeCircle = L.circle([pt[0], pt[1]], {
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.15,
        weight: 1.5,
        radius: durationMin * 15 // 15 meters radius impact per predicted duration minute
    }).addTo(map);
    
    // Zoom/pan map if forcePan is true or user is NOT actively dragging/hovering on VectorPad
    const shouldPan = forcePan || (!vectorPadState.isActive && !vectorPadState.isLocked);
    if (shouldPan) {
        map.setView([pt[0], pt[1]], 14);
    }
    
    // Draw animated diversion lines on map if we have them and a valid corridor
    if (latestForecastResult && latestForecastResult.diversion_suggestions) {
        latestForecastResult.diversion_suggestions.forEach(suggestion => {
            for (let name in centroids) {
                if (name === "Non-corridor" || name === corridor) continue;
                if (suggestion.includes(name)) {
                    const endPt = centroids[name];
                    const line = L.polyline([pt, endPt], {
                        color: "var(--accent-color)",
                        weight: 3,
                        dashArray: "6, 8",
                        opacity: 0.7,
                        className: "animated-diversion-line"
                    }).addTo(map);
                    
                    line.bindTooltip(`Diversion route: ${name}`, { sticky: true });
                    diversionLines.push(line);
                }
            }
        });
    }
}

// Debounced live forecasting logic
let debounceTimeout;
function triggerAutoForecast() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        runLiveForecast();
    }, 300); // 300ms debounce
}

async function runLiveForecast() {
    const reqBody = {
        event_type: document.getElementById("event_type").value,
        event_cause: document.getElementById("event_cause").value,
        corridor: document.getElementById("corridor").value,
        requires_road_closure: document.getElementById("requires_road_closure").checked,
        event_date: document.getElementById("event_date").value,
        event_time: document.getElementById("event_time").value
    };
    
    logConsole(`Executing real-time ML prediction pipeline for corridor: ${reqBody.corridor}...`, "predict");
    const sysStatus = document.getElementById("sys-status-badge");
    sysStatus.textContent = "[PROCESSING]";
    sysStatus.className = "header-tag text-medium";
    
    try {
        const res = await fetch("/api/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
        });
        
        if (!res.ok) throw new Error("Forecast failed");
        const r = await res.json();
        latestForecastResult = r;
        
        // Save state for Post-Event Learning
        lastInputState = r.inputs;
        basePredictedDuration = r.predicted_duration_min;
        
        // Fade in HUD results container
        document.getElementById("initial-prompt").classList.add("hidden");
        document.getElementById("prediction-results").classList.remove("hidden");
        
        // Update radial severity index circle
        updateSeverityRing(r.severity_score);
        
        // Animate metrics counters
        animateValue("res-severity-score", 0, r.severity_score, 800);
        animateValue("res-duration", 0, Math.round(r.predicted_duration_min), 800, " min");
        animateValue("res-closure", 0, Math.round(r.closure_probability), 800, "%");
        animateValue("res-similar", 0, r.historical_context.n_similar_events, 600);
        
        // Update tactical progress meters
        const durationPct = Math.min((r.predicted_duration_min / 120) * 100, 100);
        const closurePct = r.closure_probability;
        const similarPct = Math.min((r.historical_context.n_similar_events / 50) * 100, 100);
        
        const meterDur = document.getElementById("meter-fill-duration");
        const meterCls = document.getElementById("meter-fill-closure");
        const meterSim = document.getElementById("meter-fill-similar");
        if (meterDur) meterDur.style.width = `${durationPct}%`;
        if (meterCls) meterCls.style.width = `${closurePct}%`;
        if (meterSim) meterSim.style.width = `${similarPct}%`;
        
        // Set Simulator Slider defaults
        const simSlider = document.getElementById("sim-personnel-slider");
        if (simSlider) {
            simSlider.value = 5; // Reset to baseline
            document.getElementById("sim-personnel-val").textContent = "5 Officers";
            document.getElementById("sim-duration-impact").textContent = "Deploying 5 officers maintains expected clearance curves.";
        }
        
        // Populate recommendations text
        document.getElementById("reco-manpower").textContent = r.manpower_recommendation;
        
        const barricadeBlock = document.getElementById("reco-barricade-block");
        const barricadeText = document.getElementById("reco-barricade");
        barricadeText.textContent = r.barricade_recommendation;
        barricadeBlock.className = `reco-block ${r.barricade_needed ? 'warning' : 'success'}`;
        
        const diversionList = document.getElementById("reco-diversions");
        diversionList.innerHTML = "";
        r.diversion_suggestions.forEach(div => {
            const li = document.createElement("li");
            li.textContent = div;
            diversionList.appendChild(li);
        });
        
        // Precedent captions
        const caption = document.getElementById("context-caption");
        if (r.historical_context.n_similar_events > 0) {
            caption.textContent = `Based on ${r.historical_context.n_similar_events} precedents: past median duration ${Math.round(r.historical_context.historical_median_duration)} min, closure rate ${Math.round(r.historical_context.historical_closure_rate)}%.`;
        } else {
            caption.textContent = "No identical cause+location precedents found. Fallback models used.";
        }
        
        // Redraw Leaflet dynamic GIS map overlays
        drawMap(reqBody.corridor, centroids);
        
        // Enable outcome feedback
        enableLearningForm(r.inputs);
        
        sysStatus.textContent = "[SUCCESS]";
        sysStatus.className = "header-tag text-low";
        
    } catch (err) {
        logConsole(`Pipeline warning: ${err.message}`, "error");
        sysStatus.textContent = "[FAIL]";
        sysStatus.className = "header-tag text-high";
    }
}

// Personnel Simulator Slider clearance math
function initPersonnelSimulator() {
    const slider = document.getElementById("sim-personnel-slider");
    const valLabel = document.getElementById("sim-personnel-val");
    const impactText = document.getElementById("sim-duration-impact");
    
    if (!slider) return;
    
    slider.addEventListener("input", () => {
        const P = parseInt(slider.value);
        if (valLabel) valLabel.textContent = `${P} Officers`;
        
        // Exponential decay curve: baseline 5 personnel. Adding personnel reduces duration, reducing increases duration.
        const decay = Math.pow(0.92, P - 5);
        const simulatedDuration = Math.round(basePredictedDuration * decay);
        
        // Update metric display
        const durationDisplay = document.getElementById("res-duration");
        if (durationDisplay) {
            durationDisplay.textContent = `${simulatedDuration} min`;
        }
        
        // Update tactical meter fill
        const meterFillDur = document.getElementById("meter-fill-duration");
        if (meterFillDur) {
            meterFillDur.style.width = `${Math.min((simulatedDuration / 120) * 100, 100)}%`;
        }
        
        // Update Leaflet circular zone area
        if (activeCircle) {
            activeCircle.setRadius(simulatedDuration * 15);
        }
        
        // Update impact readouts
        if (impactText) {
            if (P > 5) {
                impactText.textContent = `Deploying ${P} officers reduces clearance duration by ${Math.round((1 - decay) * 100)}% to ${simulatedDuration} min.`;
            } else if (P === 5) {
                impactText.textContent = `Deploying 5 officers maintains expected clearance curves.`;
            } else {
                impactText.textContent = `Reducing deployment to ${P} officers increases clearance duration by ${Math.round((decay - 1) * 100)}% to ${simulatedDuration} min.`;
            }
        }
    });
}

function initCollapsibleSections() {
    // 1. Inputs Section Collapse
    const inputsHeader = document.getElementById("inputs-header-trigger");
    const inputsSection = document.getElementById("hud-inputs-section");
    if (inputsHeader && inputsSection) {
        inputsHeader.addEventListener("click", () => {
            inputsSection.classList.toggle("open");
        });
    }
    

    // 3. Cause Selector Dropdown Click Toggle
    const causeTrigger = document.getElementById("cause-trigger");
    const causeDropdown = document.getElementById("cause-selector-dropdown");
    if (causeTrigger && causeDropdown) {
        causeTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            causeDropdown.classList.toggle("open");
        });
        
        // Close when clicking outside
        document.addEventListener("click", (e) => {
            if (!causeDropdown.contains(e.target)) {
                causeDropdown.classList.remove("open");
            }
        });
    }
    
    // 4. VectorPad Grid Collapse
    const vpToggle = document.getElementById("vp-toggle-btn");
    const vpCollapse = document.getElementById("vector-pad-outer-collapse");
    const vpToggleText = document.getElementById("vp-toggle-text");
    const vpToggleIcon = document.getElementById("vp-toggle-icon");
    if (vpToggle && vpCollapse) {
        vpToggle.addEventListener("click", () => {
            const isOpen = vpCollapse.classList.toggle("open");
            if (vpToggleText) {
                vpToggleText.textContent = isOpen ? "Hide Grid" : "Show Grid";
            }
            if (vpToggleIcon) {
                vpToggleIcon.setAttribute("data-lucide", isOpen ? "eye-off" : "eye");
                lucide.createIcons();
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    
    const now = new Date();
    document.getElementById("event_date").value = now.toISOString().split('T')[0];
    document.getElementById("event_time").value = now.toTimeString().split(' ')[0].substring(0, 5);
    
    // Segment control events
    const segmentBtns = document.querySelectorAll(".segment-btn");
    const hiddenInput = document.getElementById("event_type");
    segmentBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            segmentBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            hiddenInput.value = btn.dataset.value;
            hiddenInput.dispatchEvent(new Event("change"));
            logConsole(`Incident classification toggled: ${btn.dataset.value.toUpperCase()}`, "system");
        });
    });
    
    updateTimeTicker();
    setInterval(updateTimeTicker, 1000);
    
    setupNavigation();
    loadSystemConfig();
    loadSystemStats();
    initPersonnelSimulator();
    initVectorPad();
    initCollapsibleSections();
    setupThemeSwitcher();
    
    // Prevent default manual submit and run forecasts dynamically instead
    document.getElementById("predict-form").addEventListener("submit", (e) => {
        e.preventDefault();
        runLiveForecast();
    });
    
    document.getElementById("feedback-form").addEventListener("submit", handleFeedbackSubmit);
    document.getElementById("retrain-btn").addEventListener("click", handleRetrainClick);
    
    // Initialize 3D interactive tilt card effect on summary metric cards
    initInteractiveTilt(".summary-metric-card", { tiltFactor: 12, hoverScale: 1.02 });
    
    // Initialize interactive severity sandbox calculator on docs panel
    initDocsCalculator();
});

// Navigation slider logic
function setupNavigation() {
    const tabs = document.querySelectorAll(".hud-tab-btn");
    const slider = document.getElementById("tabs-slider");
    
    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            if (slider) {
                slider.style.transform = `translateX(-${index * 25}%)`;
            }
            
            // Reset docs cards animation state
            const nav = document.querySelector(".docs-pipeline-nav");
            if (nav) nav.classList.remove("animate-in");
            document.querySelectorAll("#panel-about .glass-card").forEach(c => {
                c.classList.remove("animate-in");
            });
            
            if (tab.dataset.tab === "hotspots") {
                setTimeout(animateHotspotCharts, 250);
            } else if (tab.dataset.tab === "predict" && map) {
                // Force Leaflet map recalculation after sliding transition
                setTimeout(() => map.invalidateSize(), 250);
            } else if (tab.dataset.tab === "about") {
                setTimeout(animateDocsCards, 250);
            }
        });
    });
}

function updateTimeTicker() {
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options).toUpperCase();
    
    const hr = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const sec = now.getSeconds().toString().padStart(2, '0');
    
    const colon = `<span class="flash-colon">:</span>`;
    document.getElementById("live-time").innerHTML = `BLR // ${dateStr} // ${hr}${colon}${min}${colon}${sec}`;
}

async function loadSystemConfig() {
    try {
        const res = await fetch("/api/config");
        if (!res.ok) throw new Error("Config load failed");
        const data = await res.json();
        
        centroids = data.centroids;
        
        const causeGrid = document.getElementById("cause-visual-grid");
        const hiddenCauseInput = document.getElementById("event_cause");
        const corridorSelect = document.getElementById("corridor");
        
        // Define high-fidelity icons for cause visual grid
        const causeIcons = {
            'accident': 'alert-triangle',
            'vehicle_breakdown': 'wrench',
            'tree_fall': 'leaf',
            'pot_holes': 'circle-dot',
            'water_logging': 'droplet',
            'road_conditions': 'sliders',
            'congestion': 'frown',
            'construction': 'hard-hat',
            'public_event': 'users',
            'procession': 'milestone',
            'vip_movement': 'shield',
            'protest': 'megaphone',
            'others': 'more-horizontal'
        };
        
        // Populate Causes Visual Grid
        causeGrid.innerHTML = "";
        data.causes.forEach(cause => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cause-badge-btn";
            btn.dataset.value = cause;
            
            const iconName = causeIcons[cause] || 'alert-circle';
            btn.innerHTML = `
                <i data-lucide="${iconName}"></i>
                <span>${cause.replace(/_/g, ' ')}</span>
            `;
            
            btn.addEventListener("click", () => {
                causeGrid.querySelectorAll(".cause-badge-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                hiddenCauseInput.value = cause;
                hiddenCauseInput.dispatchEvent(new Event("change"));
                logConsole(`Cause selected: ${cause.toUpperCase().replace(/_/g, ' ')}`, "system");
                
                // Update Dropdown trigger badge
                const activeCauseInfo = document.getElementById("active-cause-info");
                if (activeCauseInfo) {
                    activeCauseInfo.innerHTML = `
                        <i data-lucide="${iconName}"></i>
                        <span id="active-cause-label">${cause.replace(/_/g, ' ')}</span>
                    `;
                    lucide.createIcons();
                }
                const causeDropdown = document.getElementById("cause-selector-dropdown");
                if (causeDropdown) {
                    causeDropdown.classList.remove("open");
                }
            });
            
            causeGrid.appendChild(btn);
        });
        
        // Populate Corridors dropdown
        corridorSelect.innerHTML = "";
        data.corridors.forEach(corr => {
            const opt = document.createElement("option");
            opt.value = corr;
            opt.textContent = corr;
            corridorSelect.appendChild(opt);
        });

        // Coord coordinates update
        const updateCoords = () => {
            const corr = corridorSelect.value;
            const pt = centroids[corr];
            const coordsTag = document.getElementById("corridor-coords");
            if (coordsTag) {
                if (pt) {
                    coordsTag.textContent = `GPS // ${pt[0].toFixed(4)}°N // ${pt[1].toFixed(4)}°E`;
                    coordsTag.classList.add("highlight");
                    setTimeout(() => coordsTag.classList.remove("highlight"), 300);
                } else {
                    coordsTag.textContent = `GPS // STANDBY`;
                }
            }
        };
        
        corridorSelect.addEventListener("change", () => {
            updateCoords();
            drawMap(corridorSelect.value, centroids);
            updateVectorPadPositionForCorridor(corridorSelect.value);
        });
        
        // Setup cause filtering depending on event type selection (Planned vs Unplanned buttons)
        const typeSelect = document.getElementById("event_type");
        const filterCauses = () => {
            const type = typeSelect.value;
            const plannedSet = new Set(data.planned_causes);
            let firstVisible = null;
            
            causeGrid.querySelectorAll(".cause-badge-btn").forEach(btn => {
                const cause = btn.dataset.value;
                const isPlanned = plannedSet.has(cause);
                if (type === "planned") {
                    if (isPlanned) {
                        btn.style.display = "flex";
                        if (!firstVisible) firstVisible = btn;
                    } else {
                        btn.style.display = "none";
                    }
                } else {
                    if (!isPlanned) {
                        btn.style.display = "flex";
                        if (!firstVisible) firstVisible = btn;
                    } else {
                        btn.style.display = "none";
                    }
                }
            });
            
            // Auto click the first visible cause button to run forecast
            if (firstVisible) {
                firstVisible.click();
            }
        };
        
        typeSelect.addEventListener("change", filterCauses);
        
        // Initial setup
        filterCauses();
        updateCoords();
        updateVectorPadPositionForCorridor(corridorSelect.value);
        
        // Initialize Leaflet Map
        initLeafletMap(centroids);
        
        // Debounce setup for auto-forecasting
        const inputsToWatch = [
            document.getElementById("event_type"),
            document.getElementById("event_cause"),
            document.getElementById("corridor"),
            document.getElementById("requires_road_closure"),
            document.getElementById("event_date"),
            document.getElementById("event_time")
        ];
        
        inputsToWatch.forEach(input => {
            if (input) {
                input.addEventListener("change", () => {
                    triggerAutoForecast();
                });
                if (input.tagName === "INPUT" && (input.type === "date" || input.type === "time")) {
                    input.addEventListener("input", () => {
                        triggerAutoForecast();
                    });
                }
            }
        });
        
        // Run initial forecast to pre-populate results
        runLiveForecast();
        
    } catch (err) {
        console.error("Config fetch failed", err);
    }
}

function enableLearningForm(inputs) {
    document.getElementById("learning-form-prompt").classList.add("hidden");
    const form = document.getElementById("feedback-form");
    form.classList.remove("hidden");
    
    const summary = document.getElementById("feedback-event-summary");
    summary.innerHTML = `
        <i data-lucide="info" style="width:14px;height:14px;color:#3B82F6;vertical-align:middle;margin-right:6px;"></i>
        Logging outcome for: <b>${inputs.event_cause.replace(/_/g, ' ')}</b> on <b>${inputs.corridor}</b>
    `;
    lucide.createIcons();
}

async function loadSystemStats() {
    try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Stats fetch failed");
        const stats = await res.json();
        
        animateValue("stats-logged-count", 0, stats.n_feedback, 800);
        if (stats.n_feedback > 0) {
            animateValue("stats-avg-duration", 0, stats.avg_feedback_duration, 1000, " min");
        } else {
            document.getElementById("stats-avg-duration").textContent = "N/A";
        }
        
        const telCount = document.getElementById("telemetry-feedback-count");
        if (telCount) {
            telCount.textContent = stats.n_feedback;
            telCount.className = stats.n_feedback > 0 ? "val text-medium" : "val text-low";
        }
        
        const syncStatus = document.getElementById("stats-sync-status");
        const synapseMap = document.getElementById("learning-synapse-map");
        const synapseStatus = document.getElementById("synapse-flow-status");
        
        if (stats.n_feedback > 0) {
            document.getElementById("retrain-block").classList.remove("hidden");
            syncStatus.textContent = "Retrain Ready";
            syncStatus.className = "metric-title-val text-medium";
            
            // Highlight SVG flow
            if (synapseMap) {
                synapseMap.className.baseVal = "learning-synapse-map buffer-ready";
            }
            if (synapseStatus) {
                synapseStatus.textContent = "FLOW: BUFFER_READY";
                synapseStatus.className = "header-tag warning";
            }
        } else {
            document.getElementById("retrain-block").classList.add("hidden");
            syncStatus.textContent = "Sync Ready";
            syncStatus.className = "metric-title-val text-low";
            
            // Standby SVG flow
            if (synapseMap && !synapseMap.classList.contains("synced")) {
                synapseMap.className.baseVal = "learning-synapse-map";
            }
            if (synapseStatus && synapseStatus.textContent !== "FLOW: SYNCHRONIZED") {
                synapseStatus.textContent = "FLOW: STANDBY";
                synapseStatus.className = "header-tag";
            }
        }
        
        // Populate the dynamic feedback logs cards
        const streamContainer = document.getElementById("feedback-stream-container");
        if (streamContainer) {
            streamContainer.innerHTML = "";
            if (stats.feedback_logs.length > 0) {
                const reversedLogs = [...stats.feedback_logs].reverse();
                reversedLogs.forEach(log => {
                    const card = document.createElement("div");
                    card.className = "feedback-log-card";
                    
                    const actualClosureText = log.actual_road_closure === 1 || log.actual_road_closure === true || log.actual_road_closure === "1" ? "Road Closed" : "No Closure";
                    const closureIcon = log.actual_road_closure === 1 || log.actual_road_closure === true || log.actual_road_closure === "1" ? "construction" : "unlock";
                    
                    card.innerHTML = `
                        <div class="feedback-log-header">
                            <span class="feedback-log-corridor">${escapeHTML(log.corridor)}</span>
                            <span class="feedback-log-cause">${escapeHTML(log.event_cause.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="feedback-log-details">
                            <div class="feedback-log-detail-item" title="Actual duration">
                                <i data-lucide="clock"></i>
                                <span>${log.actual_duration_min} min</span>
                            </div>
                            <div class="feedback-log-detail-item" title="closure status">
                                <i data-lucide="${closureIcon}"></i>
                                <span>${actualClosureText}</span>
                            </div>
                            <div class="feedback-log-detail-item" title="Manpower used">
                                <i data-lucide="users"></i>
                                <span>${log.manpower_used} officers</span>
                            </div>
                        </div>
                        ${log.notes ? `<div class="feedback-log-notes">"${escapeHTML(log.notes)}"</div>` : ''}
                    `;
                    streamContainer.appendChild(card);
                });
                lucide.createIcons();
            } else {
                streamContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px; font-family:var(--font-mono); font-size:0.8rem;">No logs in current retraining buffer. Log outcomes to begin synchronization.</div>`;
            }
        }
        
        drawHotspotCharts(stats);
        
    } catch (err) {
        console.error("Stats load failed", err);
    }
}

function selectAndPredictCorridor(corridorName, causeName = null) {
    const corridorSelect = document.getElementById("corridor");
    if (!corridorSelect) return;
    
    let found = false;
    for (let opt of corridorSelect.options) {
        if (opt.value === corridorName) {
            found = true;
            break;
        }
    }
    if (!found) return;
    
    // Select the corridor
    corridorSelect.value = corridorName;
    
    // Select the cause if provided
    if (causeName) {
        const eventCauseInput = document.getElementById("event_cause");
        if (eventCauseInput) {
            eventCauseInput.value = causeName;
            
            const labelEl = document.getElementById("active-cause-label");
            if (labelEl) {
                labelEl.textContent = causeName.replace(/_/g, ' ');
            }
            
            document.querySelectorAll(".cause-badge-btn").forEach(btn => {
                if (btn.dataset.value === causeName) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
            
            eventCauseInput.dispatchEvent(new Event("change"));
        }
    }
    
    const pt = centroids[corridorName];
    const coordsTag = document.getElementById("corridor-coords");
    if (coordsTag && pt) {
        coordsTag.textContent = `GPS // ${pt[0].toFixed(4)}°N // ${pt[1].toFixed(4)}°E`;
        coordsTag.classList.add("highlight");
        setTimeout(() => coordsTag.classList.remove("highlight"), 300);
    }
    
    // Update map with force pan/zoom lock enabled
    drawMap(corridorName, centroids, true);
    
    // Snap reticle to new coordinate target
    if (pt) {
        const xPct = Math.min(Math.max(((pt[1] - BENGALURU_COORDS.lngMin) / (BENGALURU_COORDS.lngMax - BENGALURU_COORDS.lngMin)) * 100, 0), 100);
        const yPct = Math.min(Math.max(((BENGALURU_COORDS.latMax - pt[0]) / (BENGALURU_COORDS.latMax - BENGALURU_COORDS.latMin)) * 100, 0), 100);
        vectorPadState.targetX = xPct;
        vectorPadState.targetY = yPct;
    }
    
    // Switch to Predict tab
    const predictTabBtn = document.querySelector('.hud-tab-btn[data-tab="predict"]');
    if (predictTabBtn) {
        predictTabBtn.click();
    }
    
    // Trigger live forecast
    runLiveForecast();
}

function drawHotspotCharts(stats) {
    let cdf = stats.corridor_stats;
    let hagg = stats.historical_agg;
    
    // 1. Projects timeline
    const timelineContainer = document.getElementById("custom-timeline-chart");
    if (timelineContainer) {
        timelineContainer.innerHTML = "";
        const cleanCdf = cdf.filter(d => d.corridor !== "Non-corridor");
        cleanCdf.sort((a, b) => b.n_events - a.n_events);
        const topCorridors = cleanCdf.slice(0, 8);
        const maxEvents = Math.max(...topCorridors.map(d => d.n_events));
        
        const gridDiv = document.createElement("div");
        gridDiv.className = "timeline-grid";
        for (let i = 0; i <= 4; i++) {
            const val = Math.round((maxEvents * i) / 4);
            const line = document.createElement("div");
            line.className = "timeline-grid-line";
            line.style.left = `${(i * 100) / 4}%`;
            line.innerHTML = `<span class="timeline-grid-label">${val}</span>`;
            gridDiv.appendChild(line);
        }
        timelineContainer.appendChild(gridDiv);
        
        const rowsDiv = document.createElement("div");
        rowsDiv.className = "timeline-rows";
        const icons = ["route", "navigation", "milestone", "alert-triangle", "map-pin", "compass", "layers", "activity"];
        
        topCorridors.forEach((d, idx) => {
            const row = document.createElement("div");
            row.className = "timeline-row";
            
            let pillClass = "pill-low";
            if (d.median_duration >= 50 && d.median_duration < 80) {
                pillClass = "pill-medium";
            } else if (d.median_duration >= 80) {
                pillClass = "pill-high";
            }
            
            const iconName = icons[idx % icons.length];
            const pct = (d.n_events / maxEvents) * 100;
            
            row.innerHTML = `
                <div class="timeline-label" title="${d.corridor}">
                    <span class="timeline-rank-badge">CRIT_0${idx + 1}</span>${d.corridor}
                </div>
                <div class="timeline-track-wrapper">
                    <div class="timeline-track-line"></div>
                    <div class="timeline-pill ${pillClass}" data-pct="${pct}" style="width: 0%;">
                        <span class="timeline-pill-icon"><i data-lucide="${iconName}"></i></span>
                        <span class="timeline-pill-value">${d.n_events}</span>
                    </div>
                    <div class="timeline-pill-detail" style="left: calc(${pct}% + 12px);">
                        <b>${d.corridor}</b><br>
                        Volume: ${d.n_events} events<br>
                        Median Duration: ${Math.round(d.median_duration)} min<br>
                        Road-Closure Rate: ${(d.closure_rate * 100).toFixed(1)}%
                    </div>
                </div>
            `;
            rowsDiv.appendChild(row);
            
            const labelEl = row.querySelector(".timeline-label");
            const pillEl = row.querySelector(".timeline-pill");
            if (labelEl) {
                labelEl.style.cursor = "pointer";
                labelEl.addEventListener("click", () => selectAndPredictCorridor(d.corridor));
            }
            if (pillEl) {
                pillEl.addEventListener("click", () => selectAndPredictCorridor(d.corridor));
            }
        });
        timelineContainer.appendChild(rowsDiv);
    }
    
    // 2. Cause + Corridor combinations grid
    const combContainer = document.getElementById("custom-combinations-chart");
    if (combContainer) {
        combContainer.innerHTML = "";
        const cleanHagg = hagg.filter(d => d.corridor !== "Non-corridor");
        cleanHagg.sort((a, b) => b.n_events - a.n_events);
        const topCombinations = cleanHagg.slice(0, 12);
        const maxCombEvents = Math.max(...topCombinations.map(d => d.n_events));
        
        topCombinations.forEach((d, idx) => {
            const card = document.createElement("div");
            card.className = "combination-card";
            
            setTimeout(() => {
                card.classList.add("animate-in");
            }, idx * 60);
            
            let dotClass = "dot-low";
            const medDur = d.median_duration || 0;
            if (medDur >= 50 && medDur < 100) {
                dotClass = "dot-medium";
            } else if (medDur >= 100) {
                dotClass = "dot-high";
            }
            
            const pct = (d.n_events / maxCombEvents) * 100;
            const targetId = `TRG_${(idx + 1).toString().padStart(2, '0')}`;
            
            card.innerHTML = `
                <div class="combination-info">
                    <div class="combination-cause-row">
                        <span class="timeline-rank-badge">${targetId}</span>
                        <span class="combination-dot ${dotClass}"></span>
                        <span class="combination-cause" title="${d.event_cause.replace(/_/g, ' ')}">${d.event_cause.replace(/_/g, ' ')}</span>
                    </div>
                    <div class="combination-corridor" title="${d.corridor}">${d.corridor}</div>
                </div>
                <div class="combination-badge">${d.n_events} events</div>
                <div class="combination-bar-bg">
                    <div class="combination-bar-fill" data-pct="${pct}" style="width: 0%;"></div>
                </div>
            `;
            card.addEventListener("click", () => selectAndPredictCorridor(d.corridor, d.event_cause));
            combContainer.appendChild(card);
        });
    }
    
    // 3. Closures rate vertical pillars
    const closuresContainer = document.getElementById("custom-closures-chart");
    if (closuresContainer) {
        closuresContainer.innerHTML = "";
        const closureCdf = cdf.filter(d => d.corridor !== "Non-corridor");
        closureCdf.sort((a, b) => b.closure_rate - a.closure_rate);
        const topClosures = closureCdf.slice(0, 10);
        
        // Dynamically scale heights relative to max values in topClosures for optimal representation
        const maxClosureRate = Math.max(...topClosures.map(d => d.closure_rate)) || 0.15;
        const maxPillarEvents = Math.max(...topClosures.map(d => d.n_events)) || 1;
        const maxClosurePct = maxClosureRate * 100;
        
        // Add horizontal dashed threshold lines inside closures chart
        const medThrY = Math.round((5 / maxClosurePct) * 125) + 40;
        const critThrY = Math.round((12 / maxClosurePct) * 125) + 40;
        
        const medLine = document.createElement("div");
        medLine.className = "closure-threshold-line";
        medLine.style.bottom = `${medThrY}px`;
        medLine.innerHTML = `<span class="closure-threshold-label">MED_THR // 5%</span>`;
        closuresContainer.appendChild(medLine);
        
        const critLine = document.createElement("div");
        critLine.className = "closure-threshold-line";
        critLine.style.bottom = `${critThrY}px`;
        critLine.innerHTML = `<span class="closure-threshold-label">CRIT_THR // 12%</span>`;
        closuresContainer.appendChild(critLine);
        
        topClosures.forEach(d => {
            const pillarGroup = document.createElement("div");
            pillarGroup.className = "closure-pillar-group";
            
            const closurePct = d.closure_rate * 100;
            
            // Scale bar height to fit between 0 and 125px (leaving space for text)
            const pillarHeightPx = Math.round((closurePct / maxClosurePct) * 125);
            // Scale dot height to fit between 0 and 125px
            const dotHeightPx = Math.round((d.n_events / maxPillarEvents) * 125);
            
            let pillClass = "pill-low";
            let dotClass = "dot-low";
            if (closurePct >= 5 && closurePct <= 12) {
                pillClass = "pill-medium";
                dotClass = "dot-medium";
            } else if (closurePct > 12) {
                pillClass = "pill-high";
                dotClass = "dot-high";
            }
            
            pillarGroup.innerHTML = `
                <div class="closure-track">
                    <div class="closure-pillar ${pillClass}" data-height="${pillarHeightPx}px" style="height: 0px;">
                        <span class="closure-pillar-val">${Math.round(closurePct)}%</span>
                    </div>
                    <div class="closure-dot ${dotClass}" data-bottom="${dotHeightPx}px" style="bottom: 0px;"></div>
                </div>
                <div class="closure-corridor-label" title="${d.corridor}">${d.corridor}</div>
                <div class="closure-tooltip">
                    <b>${d.corridor}</b><br>
                    Road-Closure Rate: ${closurePct.toFixed(1)}%<br>
                    Event Frequency: ${d.n_events} events<br>
                    Median Duration: ${Math.round(d.median_duration)} min
                </div>
            `;
            pillarGroup.addEventListener("click", () => selectAndPredictCorridor(d.corridor));
            closuresContainer.appendChild(pillarGroup);
        });
    }
    
    lucide.createIcons();
    
    // Initialize 3D interactive tilt card effect on combination cards
    initInteractiveTilt(".combination-card", { tiltFactor: 15, hoverScale: 1.03 });
    
    const activeTab = document.querySelector(".hud-tab-btn.active");
    if (activeTab && activeTab.dataset.tab === "hotspots") {
        setTimeout(animateHotspotCharts, 100);
    }
}

function animateHotspotCharts() {
    document.querySelectorAll(".timeline-pill").forEach(el => {
        el.style.width = el.dataset.pct + "%";
    });
    document.querySelectorAll(".combination-bar-fill").forEach(el => {
        el.style.width = el.dataset.pct + "%";
    });
    document.querySelectorAll(".closure-pillar").forEach(el => {
        el.style.height = el.dataset.height;
    });
    document.querySelectorAll(".closure-dot").forEach(el => {
        el.style.bottom = el.dataset.bottom;
    });
}

function animateDocsCards() {
    const nav = document.querySelector(".docs-pipeline-nav");
    if (nav) {
        nav.classList.add("animate-in");
    }
    
    // Also stagger animate-in active panel
    const activePanel = document.querySelector(".docs-detail-panel.active");
    if (activePanel) {
        setTimeout(() => {
            activePanel.classList.add("animate-in");
        }, 150);
    }
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    if (!lastInputState) {
        alert("Please run a prediction first.");
        return;
    }
    
    const submitBtn = e.target.querySelector("button[type='submit']");
    const origHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader" class="spin"></i> Logging...`;
    lucide.createIcons();
    
    const reqBody = {
        ...lastInputState,
        actual_duration_min: parseFloat(document.getElementById("actual_duration").value),
        actual_road_closure: document.getElementById("actual_road_closure").checked,
        manpower_used: parseInt(document.getElementById("manpower_used").value),
        notes: document.getElementById("notes").value
    };
    
    logConsole(`Submitting logged actual outcome: actual_dur = ${reqBody.actual_duration_min} min | manpower_used = ${reqBody.manpower_used}`, "predict");
    
    try {
        const res = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
        });
        
        if (!res.ok) throw new Error("Feedback log failed");
        
        document.getElementById("feedback-form").reset();
        document.getElementById("feedback-form").classList.add("hidden");
        document.getElementById("learning-form-prompt").classList.remove("hidden");
        
        lastInputState = null;
        await loadSystemStats();
        
        document.getElementById("retrain-success").classList.add("hidden");
        logConsole("Outcome registered successfully. Model synchronization ready.", "success");
        alert("Actual outcome logged successfully.");
        
    } catch (err) {
        logConsole(`Logging failed: ${err.message}`, "error");
        alert("Error logging outcome: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
        lucide.createIcons();
    }
}

async function handleRetrainClick() {
    const btn = document.getElementById("retrain-btn");
    const origHtml = btn.innerHTML;
    const synapseMap = document.getElementById("learning-synapse-map");
    const synapseStatus = document.getElementById("synapse-flow-status");
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="refresh-cw" class="spin"></i> Retraining...`;
    lucide.createIcons();
    
    // Set SVG to retraining mode
    if (synapseMap) {
        synapseMap.className.baseVal = "learning-synapse-map retraining";
    }
    if (synapseStatus) {
        synapseStatus.textContent = "FLOW: SYNCHRONIZING";
        synapseStatus.className = "header-tag text-medium";
    }
    
    logConsole("Initializing model training pipeline refit...", "warning");
    
    try {
        const res = await fetch("/api/retrain", { method: "POST" });
        if (!res.ok) throw new Error("Retraining failed");
        const r = await res.json();
        
        // Show success
        document.getElementById("retrain-success").classList.remove("hidden");
        document.getElementById("retrain-metrics").innerHTML = `
            <li>Duration Regressor R²: <b>${r.r2.toFixed(4)}</b></li>
            <li>Duration Regressor MAE: <b>${r.mae.toFixed(4)} log-min</b></li>
            <li>Closure Classifier Accuracy: <b>${r.accuracy.toFixed(4)}</b></li>
            <li>Closure Classifier F1: <b>${r.f1.toFixed(4)}</b></li>
        `;
        
        // Set SVG to synced mode and keep it for 3.5 seconds
        if (synapseMap) {
            synapseMap.className.baseVal = "learning-synapse-map synced";
        }
        if (synapseStatus) {
            synapseStatus.textContent = "FLOW: SYNCHRONIZED";
            synapseStatus.className = "header-tag text-low";
        }
        
        logConsole(`Retraining finished. Regressor R² = ${r.r2.toFixed(4)} | Classifier Acc = ${r.accuracy.toFixed(4)}`, "success");
        
        // Load stats after a slight delay to allow user to appreciate the synced success animation!
        setTimeout(async () => {
            await loadSystemStats();
            const syncStatus = document.getElementById("stats-sync-status");
            if (syncStatus) {
                syncStatus.textContent = "Retrained";
                syncStatus.className = "metric-title-val text-low";
            }
        }, 3500);
        
    } catch (err) {
        // Reset flow state on error
        await loadSystemStats();
        logConsole(`Retraining crashed: ${err.message}`, "error");
        alert("Retrain error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        lucide.createIcons();
    }
}

// Persisted theme switcher
function setupThemeSwitcher() {
    const toggleBtn = document.getElementById("theme-toggle");
    const logoImg = document.getElementById("logo-img");
    
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    
    const applyTheme = (theme) => {
        if (theme === "light") {
            document.body.setAttribute("data-theme", "light");
            if (logoImg) logoImg.src = "/static/favicon.svg";
            localStorage.setItem("theme", "light");
        } else {
            document.body.removeAttribute("data-theme");
            if (logoImg) logoImg.src = "/static/favicon.svg";
            localStorage.setItem("theme", "dark");
        }
        
        // Update Leaflet tile layers
        updateMapTiles();
        
        // Redraw initial corridor layout with theme-sensitive markers
        if (typeof centroids !== "undefined" && Object.keys(centroids).length > 0) {
            drawInitialCorridors(centroids);
            const currentCorridor = document.getElementById("corridor")?.value;
            drawMap(currentCorridor || "Non-corridor", centroids);
        }
        
        logConsole(`Theme updated: switched to ${theme.toUpperCase()} style.`, "system");
    };
    
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (systemPrefersLight) {
        applyTheme("light");
    } else {
        applyTheme("dark");
    }
    
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const nextTheme = document.body.getAttribute("data-theme") === "light" ? "dark" : "light";
            applyTheme(nextTheme);
        });
    }
}

// Docs Interactive Sandbox Logic
function initDocsCalculator() {
    // Pipeline timeline navigation
    const pipelineSteps = document.querySelectorAll(".pipeline-step");
    const pipelineFill = document.getElementById("docs-pipeline-fill");
    
    pipelineSteps.forEach((step, idx) => {
        step.addEventListener("click", () => {
            pipelineSteps.forEach(s => s.classList.remove("active"));
            step.classList.add("active");
            
            const stepNum = idx + 1;
            if (pipelineFill) {
                pipelineFill.style.width = `${idx * 25}%`;
            }
            
            const panels = document.querySelectorAll(".docs-detail-panel");
            panels.forEach(p => {
                p.classList.remove("active", "animate-in");
            });
            
            const targetPanel = document.getElementById(`docs-panel-${stepNum}`);
            if (targetPanel) {
                targetPanel.classList.add("active");
                // Trigger stagger fade-in
                setTimeout(() => {
                    targetPanel.classList.add("animate-in");
                }, 30);
            }
            
            // Re-compile MathJax equations inside the new panel
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise();
            }
        });
    });

    const sDur = document.getElementById("docs-slider-w-dur");
    const sClose = document.getElementById("docs-slider-w-close");
    const sCorr = document.getElementById("docs-slider-w-corr");
    const sPeak = document.getElementById("docs-slider-w-peak");
    
    if (!sDur || !sClose || !sCorr || !sPeak) return;
    
    const labelDur = document.getElementById("docs-w-dur-val");
    const labelClose = document.getElementById("docs-w-close-val");
    const labelCorr = document.getElementById("docs-w-corr-val");
    const labelPeak = document.getElementById("docs-w-peak-val");
    
    const eqDur = document.getElementById("docs-eq-w-dur");
    const eqClose = document.getElementById("docs-eq-w-close");
    const eqCorr = document.getElementById("docs-eq-w-corr");
    const eqPeak = document.getElementById("docs-eq-w-peak");
    
    const statusBox = document.getElementById("docs-sandbox-status");
    const statusText = document.getElementById("docs-sandbox-status-text");
    
    const scenarioBtns = document.querySelectorAll(".docs-scenario-btn");
    
    const scoreNum = document.getElementById("docs-score-num");
    const scoreBand = document.getElementById("docs-score-band");
    const gaugePath = document.getElementById("docs-gauge-path");
    const scenarioDesc = document.getElementById("docs-scenario-desc");
    
    const scenarios = {
        "critical-crash": {
            pd: 90,
            pc: 85,
            ic: 95,
            mt: 100,
            desc: "Outer Ring Road accident. Estimated duration percentile is 90%, closure probability is 85%, corridor criticality is 95%, peak-hour time factor is 1.0 (Peak)."
        },
        "midday-pothole": {
            pd: 35,
            pc: 10,
            ic: 40,
            mt: 40,
            desc: "Hosur Road minor pothole. Estimated duration percentile is 35%, closure probability is 10%, corridor criticality is 40%, off-peak time factor is 0.4."
        },
        "midnight-work": {
            pd: 65,
            pc: 95,
            ic: 60,
            mt: 40,
            desc: "Bannerghatta Road planned drainage repair. Estimated duration percentile is 65%, closure probability is 95%, corridor criticality is 60%, off-peak time factor is 0.4."
        }
    };
    
    let currentScenario = "critical-crash";
    
    function recalculate() {
        const wDur = parseInt(sDur.value) || 0;
        const wClose = parseInt(sClose.value) || 0;
        const wCorr = parseInt(sCorr.value) || 0;
        const wPeak = parseInt(sPeak.value) || 0;
        
        labelDur.textContent = `${wDur}%`;
        labelClose.textContent = `${wClose}%`;
        labelCorr.textContent = `${wCorr}%`;
        labelPeak.textContent = `${wPeak}%`;
        
        eqDur.textContent = (wDur / 100).toFixed(2);
        eqClose.textContent = (wClose / 100).toFixed(2);
        eqCorr.textContent = (wCorr / 100).toFixed(2);
        eqPeak.textContent = (wPeak / 100).toFixed(2);
        
        const sum = wDur + wClose + wCorr + wPeak;
        
        if (sum === 100) {
            statusBox.className = "sandbox-total-bar success";
            statusText.textContent = "TOTAL WEIGHT: 100% (BALANCED)";
        } else {
            statusBox.className = "sandbox-total-bar warning";
            statusText.textContent = `TOTAL WEIGHT: ${sum}% (UNBALANCED - MUST EQUAL 100%)`;
        }
        
        const scenario = scenarios[currentScenario];
        let score = (wDur * scenario.pd + wClose * scenario.pc + wCorr * scenario.ic + wPeak * scenario.mt) / 100;
        score = Math.min(Math.max(score, 0), 100);
        
        if (sum === 0) {
            score = 0;
        }
        
        scoreNum.textContent = score.toFixed(1);
        
        let band = "LOW";
        let colorVar = "var(--color-low)";
        if (score < 35) {
            band = "LOW";
            colorVar = "var(--color-low)";
        } else if (score < 65) {
            band = "MEDIUM";
            colorVar = "var(--color-medium)";
        } else {
            band = "HIGH";
            colorVar = "var(--color-high)";
        }
        
        scoreBand.textContent = band;
        scoreBand.style.color = colorVar;
        
        // Circular gauge offset: circumference is 263.89
        const offset = 263.89 - (263.89 * score) / 100;
        gaugePath.style.strokeDashoffset = offset;
        gaugePath.style.stroke = colorVar;
        
        scenarioDesc.textContent = scenario.desc;
    }
    
    [sDur, sClose, sCorr, sPeak].forEach(slider => {
        slider.addEventListener("input", recalculate);
    });
    
    scenarioBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            scenarioBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentScenario = btn.dataset.scenario;
            recalculate();
        });
    });
    
    recalculate();
}
