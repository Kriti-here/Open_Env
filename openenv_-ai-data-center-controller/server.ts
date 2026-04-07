import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- OpenEnv Environment Logic ---
  
  interface EnvState {
    step: number;
    it_load_kw: number;
    ambient_temp_c: number;
    internal_temp_c: number;
    grid_carbon_intensity: number;
    solar_output_kw: number;
    battery_soc: number;
    cooling_power_kw: number;
    total_cost: number;
    total_carbon: number;
    done: boolean;
    task_id: string;
    forecast?: {
      time: string;
      ambient: number;
      internal: number;
      recommendation: string;
    }[];
  }

  interface RunResult {
    id: string;
    taskId: string;
    totalCost: number;
    totalCarbon: number;
    finalStep: number;
    timestamp: string;
    avgPue: number;
  }

  let state: EnvState = {
    step: 0,
    it_load_kw: 500,
    ambient_temp_c: 22,
    internal_temp_c: 22,
    grid_carbon_intensity: 300,
    solar_output_kw: 0,
    battery_soc: 0.5,
    cooling_power_kw: 100,
    total_cost: 0,
    total_carbon: 0,
    done: false,
    task_id: "steady-state-efficiency"
  };

  let history: RunResult[] = [];
  let pueSum = 0;
  let pueCount = 0;
  let currentForecast: any[] = [];

  const resetEnv = (taskId: string = "steady-state-efficiency") => {
    state = {
      step: 0,
      it_load_kw: taskId === "steady-state-efficiency" ? 800 : 800,
      ambient_temp_c: taskId === "extreme-weather-optimization" ? 38 : 24,
      internal_temp_c: 23,
      grid_carbon_intensity: taskId === "extreme-weather-optimization" ? 750 : 400,
      solar_output_kw: 0,
      battery_soc: 0.4,
      cooling_power_kw: 150,
      total_cost: 0,
      total_carbon: 0,
      done: false,
      task_id: taskId
    };
    pueSum = 0;
    pueCount = 0;
    return state;
  };

  // OpenEnv Endpoints
  app.get("/history", (req, res) => {
    res.json(history);
  });

  app.post("/reset", (req, res) => {
    const { task_id } = req.body;
    const newState = resetEnv(task_id);
    res.json(newState);
  });

  app.post("/step", (req, res) => {
    if (state.done) {
      return res.status(400).json({ error: "Environment is done. Call /reset." });
    }

    const { cooling_setpoint, battery_charge_rate, it_load_shift, is_predictive, ai_forecast, ai_setpoint, ai_load_shift } = req.body;

    if (is_predictive && ai_forecast) {
      currentForecast = ai_forecast;
    }

    // Apply predictive nudges if available and enabled
    const finalSetpoint = (is_predictive && ai_setpoint !== undefined) ? ai_setpoint : cooling_setpoint;
    const finalLoadShift = (is_predictive && ai_load_shift !== undefined) ? ai_load_shift : it_load_shift;

    // Simulation Logic
    state.step++;
    
    // 1. Update Ambient Conditions (Deterministic based on step)
    const timeOfDay = (state.step % 288) / 288 * 24;
    if (state.task_id === "steady-state-efficiency") {
      state.ambient_temp_c = 22; // Stable
      state.solar_output_kw = 0;
      state.grid_carbon_intensity = 300;
    } else if (state.task_id === "renewable-integration") {
      state.ambient_temp_c = 20 + 8 * Math.sin((timeOfDay - 6) * Math.PI / 12);
      state.solar_output_kw = Math.max(0, 400 * Math.sin((timeOfDay - 6) * Math.PI / 12));
      state.grid_carbon_intensity = 400 + 100 * Math.cos(timeOfDay * Math.PI / 12);
    } else if (state.task_id === "extreme-weather-optimization") {
      state.ambient_temp_c = 32 + 12 * Math.sin((timeOfDay - 6) * Math.PI / 12); // Extreme heat
      state.solar_output_kw = Math.max(0, 500 * Math.sin((timeOfDay - 6) * Math.PI / 12));
      state.grid_carbon_intensity = 600 + 150 * Math.sin(timeOfDay * Math.PI / 12);
    }

    // 2. IT Load Logic
    let baseLoad = state.task_id === "steady-state-efficiency" ? 500 : 800;
    if (state.task_id !== "steady-state-efficiency") {
      baseLoad += 200 * Math.sin(timeOfDay * Math.PI / 12); // Variable load
    }
    state.it_load_kw = baseLoad * (1 + (finalLoadShift || 0));

    // 3. Simplified Cooling Physics (Deterministic with slight stochastic noise for realism)
    const targetTemp = finalSetpoint || 22;
    const thermalNoise = (Math.random() - 0.5) * 0.05; // Small random fluctuation
    
    // Cooling power needed to counteract heat gain and reach target
    const coolingPowerNeeded = Math.max(0, (state.internal_temp_c - targetTemp) * 20 + (state.ambient_temp_c - state.internal_temp_c) * 5);
    state.cooling_power_kw = Math.min(1000, coolingPowerNeeded); // Cap cooling power
    
    // Internal temp change: Heat from IT + Ambient - Cooling
    // Coefficients with slight variance
    const heatFromIT = state.it_load_kw * (0.01 + thermalNoise * 0.01); 
    const heatFromAmbient = (state.ambient_temp_c - state.internal_temp_c) * (0.02 + thermalNoise * 0.02);
    const coolingEffect = state.cooling_power_kw * (0.005 + thermalNoise * 0.005);
    
    const netHeatChange = heatFromIT + heatFromAmbient - coolingEffect;
    state.internal_temp_c += netHeatChange;

    // 4. Battery Logic
    const maxChargeRate = 150; // kW
    const chargePower = (battery_charge_rate || 0) * maxChargeRate;
    const batteryCapacity = 500; // kWh
    const deltaSoc = (chargePower / batteryCapacity) * (5 / 60); // 5 min step
    state.battery_soc = Math.max(0, Math.min(1, state.battery_soc + deltaSoc));

    // 5. Power Balance & Costs
    const netPower = state.it_load_kw + state.cooling_power_kw - state.solar_output_kw + chargePower;
    const gridPower = Math.max(0, netPower);
    
    const electricityPrice = state.task_id === "renewable-integration" ? (timeOfDay > 16 && timeOfDay < 21 ? 0.30 : 0.10) : 0.15;
    const stepCost = gridPower * electricityPrice * (5 / 60);
    const stepCarbon = gridPower * state.grid_carbon_intensity / 1000 * (5 / 60);

    state.total_cost += stepCost;
    state.total_carbon += stepCarbon;

    // Track PUE for history
    const currentPue = (state.it_load_kw + state.cooling_power_kw) / state.it_load_kw;
    pueSum += currentPue;
    pueCount++;

    // 6. CLEAR + BALANCED REWARD FUNCTION
    // Thermal Score: 1.0 if safe (<25), drops to 0.0 at 32
    const thermalScore = Math.max(0, Math.min(1, 1 - Math.max(0, state.internal_temp_c - 25) / 7));
    
    // Carbon Score: Normalized against a "bad" baseline (e.g., 20kg/step)
    const carbonScore = Math.max(0, 1 - stepCarbon / 20);
    
    // Cost Score: Normalized against a "bad" baseline (e.g., $10/step)
    const costScore = Math.max(0, 1 - stepCost / 10);

    // Weighted Reward (Sum = 1.0)
    const w_thermal = 0.5; // Safety first
    const w_carbon = 0.3;
    const w_cost = 0.2;
    
    const reward = (w_thermal * thermalScore) + (w_carbon * carbonScore) + (w_cost * costScore);

    // Check done
    const maxSteps = state.task_id === "steady-state-efficiency" ? 100 : (state.task_id === "renewable-integration" ? 288 : 500);
    if (state.step >= maxSteps || state.internal_temp_c > 45) {
      state.done = true;
      
      // Save to history
      const result: RunResult = {
        id: Math.random().toString(36).substring(7),
        taskId: state.task_id,
        totalCost: state.total_cost,
        totalCarbon: state.total_carbon,
        finalStep: state.step,
        timestamp: new Date().toISOString(),
        avgPue: pueSum / pueCount
      };
      history.unshift(result);
      if (history.length > 20) history.pop();
    }

    res.json({
      observation: { ...state, forecast: currentForecast },
      reward: Math.max(0, Math.min(1, reward)),
      done: state.done,
      info: {
        thermal_score: thermalScore,
        carbon_score: carbonScore,
        cost_score: costScore
      }
    });
  });

  app.get("/state", (req, res) => {
    res.json(state);
  });

  // --- Vite / Static Files ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
