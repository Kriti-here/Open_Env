---
title: Open Env
emoji: 🌱
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# OpenEnv Data Center AI Controller & Digital Twin
This project is a high-fidelity, AI-powered Digital Twin and Controller for the **OpenEnv** Data Center Thermal Management framework. It is designed for the Scaler School of Technology challenge.

## 🚀 Features
- **OpenEnv Logic**: Implements Steady State, Renewable Integration, and Extreme Weather scenarios.
- **AI Predictive Cooling**: Integrated with **Gemini 1.5 Flash** to forecast thermal trends and proactively adjust setpoints.
- **Real-time Telemetry**: Live tracking of PUE, Carbon Intensity, Battery SoC, and Thermal Safety.
- **Interactive Controls**: Manual and AI-driven management of Cooling, BESS, and IT Load Shifting.

## 🛠 Prerequisites
- **Python 3.10+**
- **Docker**
- **Git/GitHub**
- **Hugging Face**

## 📦 Deployment Instructions
### 1. GitHub Submission
1. Initialize a git repo: `git init`
2. Add files: `git add .`
3. Commit: `git commit -m "Initial OpenEnv Submission"`
4. Push to your GitHub account.

### 2. Hugging Face Spaces
1. Install CLI: `pip install huggingface_hub`
2. Login: `huggingface-cli login`
3. Create a new Space with Docker SDK.
4. Push this directory to your Space.

### 3. Docker Testing
```bash
docker build -t openenv-app .
docker run -p 7860:7860 openenv-app
```

## 🧠 AI Strategy
The controller uses a **Predictive Cooling** strategy. It forecasts ambient spikes 1-3 hours in advance and triggers pre-cooling cycles to maintain thermal safety while minimizing PUE and Carbon footprint.

---
**Submission Deadline**: 8th April 11:59 PM
**Developer**: kritii1977@gmail.com
