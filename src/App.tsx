import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Activity, 
  Zap, 
  ArrowUp,
  ArrowDown,
  Thermometer, 
  Battery, 
  Cloud, 
  DollarSign, 
  RefreshCw, 
  Play, 
  Pause,
  AlertTriangle,
  Leaf,
  Server,
  Wind,
  BookOpen,
  History,
  X,
  Info,
  MessageSquare,
  Send,
  Loader2,
  Cpu
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

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
  forecast?: any[];
}

export default function App() {
  const [state, setState] = useState<EnvState | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoStep, setAutoStep] = useState(false);
  const [taskId, setTaskId] = useState("steady-state-efficiency");
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<{ 
    step: number; 
    reward: number; 
    pue: number;
    battery_soc: number;
    battery_charge_rate: number;
    grid_carbon_intensity: number;
  }[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; message: string; type: 'warning' | 'critical' }[]>([]);
  const [showKB, setShowKB] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isPredictiveCooling, setIsPredictiveCooling] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: "Hello! I'm your OpenEnv Assistant. How can I help you optimize your data center today?" }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'controls' | 'details' | 'history'>('telemetry');
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [aiForecast, setAiForecast] = useState<any[]>([]);
  const [aiSetpoint, setAiSetpoint] = useState<number | null>(null);
  const [aiLoadShift, setAiLoadShift] = useState<number | null>(null);
  const [lastForecastStep, setLastForecastStep] = useState(-100);
  const [isForecasting, setIsForecasting] = useState(false);

  const suggestedQuestions = [
    "How can I improve my PUE?",
    "What is the best battery strategy?",
    "Explain the current task goals",
    "How does ambient temp affect cooling?"
  ];

  // Manual Controls State
  const [coolingSetpoint, setCoolingSetpoint] = useState(22);
  const [batteryChargeRate, setBatteryChargeRate] = useState(0);
  const [itLoadShift, setItLoadShift] = useState(0);

  const getAIForecast = useCallback(async (currentState: EnvState) => {
    if (isForecasting) return;
    setIsForecasting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const prompt = `
        You are an expert Data Center Thermal Engineer. 
        Current Data Center State:
        - Task: ${currentState.task_id}
        - Step: ${currentState.step} (5 min per step)
        - Ambient Temp: ${currentState.ambient_temp_c.toFixed(1)}°C
        - Internal Temp: ${currentState.internal_temp_c.toFixed(1)}°C
        - IT Load: ${currentState.it_load_kw}kW
        - Solar: ${currentState.solar_output_kw}kW
        - Battery SoC: ${(currentState.battery_soc * 100).toFixed(1)}%

        Based on the task scenario (${currentState.task_id}), forecast the ambient and internal temperatures for the next 3 hours (36 steps) in 30-minute intervals (6 points).
        Also provide a control recommendation (cooling setpoint and IT load shift nudge).

        Return ONLY a JSON object with this structure:
        {
          "forecast": [
            {"time": "+30m", "ambient": number, "internal": number, "recommendation": "string"},
            ... (6 points total)
          ],
          "suggested_setpoint": number,
          "suggested_load_shift": number
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              forecast: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    ambient: { type: Type.NUMBER },
                    internal: { type: Type.NUMBER },
                    recommendation: { type: Type.STRING }
                  },
                  required: ["time", "ambient", "internal", "recommendation"]
                }
              },
              suggested_setpoint: { type: Type.NUMBER },
              suggested_load_shift: { type: Type.NUMBER }
            },
            required: ["forecast", "suggested_setpoint", "suggested_load_shift"]
          }
        }
      });

      const parsed = JSON.parse(response.text);
      setAiForecast(parsed.forecast);
      setAiSetpoint(parsed.suggested_setpoint);
      setAiLoadShift(parsed.suggested_load_shift);
      setLastForecastStep(currentState.step);
    } catch (err) {
      console.error("AI Forecast Error:", err);
    } finally {
      setIsForecasting(false);
    }
  }, [isForecasting]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/history');
      const data = await res.json();
      setRunHistory(data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/state');
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error("Failed to fetch state", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetEnv = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch('/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id })
      });
      const data = await res.json();
      setState(data);
      setTaskId(id);
      setLastReward(null);
      setTelemetryHistory([]);
      // Reset controls to defaults
      setCoolingSetpoint(22);
      setBatteryChargeRate(0);
      setItLoadShift(0);
    } catch (err) {
      console.error("Failed to reset", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const stepEnv = useCallback(async () => {
    if (!state || state.done) return;

    // Trigger AI forecast if needed
    if (isPredictiveCooling && state.step - lastForecastStep >= 12) {
      getAIForecast(state);
    }

    try {
      const res = await fetch('/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooling_setpoint: coolingSetpoint,
          battery_charge_rate: batteryChargeRate,
          it_load_shift: itLoadShift,
          is_predictive: isPredictiveCooling,
          task_id: taskId,
          ai_forecast: aiForecast,
          ai_setpoint: aiSetpoint ?? undefined,
          ai_load_shift: aiLoadShift ?? undefined
        })
      });
      const data = await res.json();
      if (data && data.observation) {
        setState(data.observation);
        setLastReward(data.reward);
        const pue = (data.observation.it_load_kw + data.observation.cooling_power_kw) / data.observation.it_load_kw;
        setTelemetryHistory(prev => [...prev, { 
          step: data.observation.step, 
          reward: data.reward, 
          pue,
          battery_soc: data.observation.battery_soc,
          battery_charge_rate: batteryChargeRate,
          grid_carbon_intensity: data.observation.grid_carbon_intensity
        }].slice(-100));

        if (data.observation.done) {
          fetchHistory();
        }
      }
    } catch (err) {
      console.error("Failed to step", err);
    }
  }, [state, coolingSetpoint, batteryChargeRate, itLoadShift, isPredictiveCooling, taskId]);

  useEffect(() => {
    fetchState();
    fetchHistory();
  }, [fetchState, fetchHistory]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoStep && state && !state.done) {
      interval = setInterval(stepEnv, 500);
    } else {
      setAutoStep(false);
    }
    return () => clearInterval(interval);
  }, [autoStep, state, stepEnv]);

  useEffect(() => {
    if (isPredictiveCooling && state && !state.done && lastForecastStep === -100) {
      getAIForecast(state);
    }
  }, [isPredictiveCooling, state, getAIForecast, lastForecastStep]);

  const processMessage = async (text: string) => {
    if (!text.trim() || isChatLoading) return;

    const userMessage = text.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const model = "gemini-3-flash-preview";
      
      const systemInstruction = `You are the OpenEnv Data Center Assistant. You help users understand the data center simulation, its controls, and the AI's decision-making process.
      Simulation Details:
      - Thermal Dynamics: Heat from IT load and ambient environment vs cooling power. Target temp: 22-25°C.
      - Energy: 500kW solar array, 500kWh battery (150kW charge/discharge).
      - Reward Function: 40% Thermal Safety, 30% Carbon Minimization, 30% Cost Efficiency.
      - Tasks: Steady State (Easy), Renewable Integration (Medium), Heatwave (Hard).
      - Controls: Cooling Setpoint, Battery Charge Rate, IT Load Shift.
      Current State: ${JSON.stringify(state)}
      Answer concisely and professionally. If the user asks about the current state, use the provided data.`;

      const response = await ai.models.generateContent({
        model,
        contents: [
          ...chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction,
          maxOutputTokens: 500,
        }
      });

      const aiText = response.text || "I'm sorry, I couldn't process that request.";
      setChatMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting to my brain right now. Please try again later." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    processMessage(chatInput);
  };
    
  useEffect(() => {
    if (!state) return;
    
    const newAlerts: { id: string; message: string; type: 'warning' | 'critical' }[] = [];
    
    if (state.internal_temp_c > 30) {
      newAlerts.push({ 
        id: 'temp-critical', 
        message: `Critical Temperature: ${state.internal_temp_c.toFixed(1)}°C`, 
        type: 'critical' 
      });
    } else if (state.internal_temp_c > 27) {
      newAlerts.push({ 
        id: 'temp-warning', 
        message: `High Temperature: ${state.internal_temp_c.toFixed(1)}°C`, 
        type: 'warning' 
      });
    }

    if (state.battery_soc < 0.1) {
      newAlerts.push({ 
        id: 'battery-low', 
        message: `Low Battery SOC: ${(state.battery_soc * 100).toFixed(1)}%`, 
        type: 'critical' 
      });
    }

    setAlerts(newAlerts);
  }, [state]);

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="text-emerald-500 w-12 h-12" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ rotate: 180 }}
              className="p-2 bg-emerald-500/10 rounded-lg"
            >
              <Activity className="text-emerald-500 w-5 h-5 sm:w-6 sm:h-6" />
            </motion.div>
            <div>
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-white leading-tight">OpenEnv</h1>
              <p className="text-[10px] text-slate-500 font-mono hidden sm:block">Sustainable Data Center v1.0</p>
            </div>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center bg-slate-800/50 rounded-xl p-1 border border-slate-700">
              <button 
                onClick={() => resetEnv("steady-state-efficiency")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${taskId === 'steady-state-efficiency' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                Steady
              </button>
              <button 
                onClick={() => resetEnv("renewable-integration")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${taskId === 'renewable-integration' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                Renewables
              </button>
              <button 
                onClick={() => resetEnv("extreme-weather-optimization")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${taskId === 'extreme-weather-optimization' ? 'bg-rose-500 text-slate-950 shadow-lg shadow-rose-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                Heatwave
              </button>
            </div>

            <div className="h-6 w-px bg-slate-800 mx-2" />
            
            <button 
              onClick={() => setAutoStep(!autoStep)}
              disabled={state.done}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                autoStep 
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {autoStep ? <Pause size={16} /> : <Play size={16} />}
              {autoStep ? 'Pause' : 'Run Agent'}
            </button>
            
            <div className="flex items-center gap-1">
              <HeaderAction icon={<History size={18} />} onClick={() => setShowHistoryModal(true)} color="white" />
              <HeaderAction icon={<BookOpen size={18} />} onClick={() => setShowKB(true)} color="emerald" />
              <HeaderAction icon={<MessageSquare size={18} />} onClick={() => setShowChat(true)} color="blue" />
              <HeaderAction icon={<RefreshCw size={18} />} onClick={() => resetEnv(taskId)} color="white" />
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X size={24} /> : <Activity size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-slate-800 bg-slate-900/95 overflow-hidden"
            >
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <MobileTaskBtn active={taskId === 'steady-state-efficiency'} label="Steady" onClick={() => { resetEnv('steady-state-efficiency'); setMobileMenuOpen(false); }} />
                  <MobileTaskBtn active={taskId === 'renewable-integration'} label="Renew" onClick={() => { resetEnv('renewable-integration'); setMobileMenuOpen(false); }} />
                  <MobileTaskBtn active={taskId === 'extreme-weather-optimization'} label="Heat" onClick={() => { resetEnv('extreme-weather-optimization'); setMobileMenuOpen(false); }} />
                </div>
                <button 
                  onClick={() => { setAutoStep(!autoStep); setMobileMenuOpen(false); }}
                  className="w-full py-3 bg-emerald-500 text-slate-950 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  {autoStep ? <Pause size={18} /> : <Play size={18} />}
                  {autoStep ? 'Pause Agent' : 'Run Agent'}
                </button>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <button onClick={() => { setShowHistoryModal(true); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 text-slate-400">
                    <History size={20} />
                    <span className="text-[10px] uppercase font-bold">History</span>
                  </button>
                  <button onClick={() => { setShowKB(true); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 text-slate-400">
                    <BookOpen size={20} />
                    <span className="text-[10px] uppercase font-bold">Docs</span>
                  </button>
                  <button onClick={() => { setShowChat(true); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 text-slate-400">
                    <MessageSquare size={20} />
                    <span className="text-[10px] uppercase font-bold">Chat</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Mobile Tab Switcher */}
        <div className="lg:hidden flex bg-slate-900/50 border border-slate-800 rounded-xl p-1 mb-6">
          <TabBtn active={activeTab === 'telemetry'} label="Telemetry" onClick={() => setActiveTab('telemetry')} />
          <TabBtn active={activeTab === 'controls'} label="Controls" onClick={() => setActiveTab('controls')} />
          <TabBtn active={activeTab === 'history'} label="History" onClick={() => setActiveTab('history')} />
        </div>
        {/* Status Banner */}
        <AnimatePresence mode="wait">
          {alerts.length > 0 && (
            <motion.div 
              key="alerts-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 space-y-2"
            >
              {alerts.map(alert => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded-xl border flex items-center gap-3 animate-pulse ${
                    alert.type === 'critical' 
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                  }`}
                >
                  <AlertTriangle size={18} />
                  <span className="text-sm font-bold">{alert.message}</span>
                </div>
              ))}
            </motion.div>
          )}

          {state.done && (
            <motion.div 
              key="termination-banner"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <AlertTriangle className="text-amber-500" />
                <div>
                  <h3 className="font-bold text-amber-500">Environment Terminated</h3>
                  <p className="text-sm text-amber-500/80">The simulation has reached its maximum steps or safety limits.</p>
                </div>
              </div>
              <button 
                onClick={() => resetEnv(taskId)}
                className="px-4 py-2 bg-amber-500 text-slate-950 rounded-lg text-sm font-bold hover:bg-amber-400 transition-colors"
              >
                Restart Simulation
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
          <StatCard 
            icon={<Thermometer className="text-rose-500" />}
            label="Internal Temp"
            value={`${state.internal_temp_c.toFixed(1)}°C`}
            subValue={`Ambient: ${state.ambient_temp_c.toFixed(1)}°C`}
            trend={state.internal_temp_c > 27 ? "danger" : "normal"}
          />
          <StatCard 
            icon={<Zap className="text-amber-500" />}
            label="IT Load"
            value={`${state.it_load_kw.toFixed(0)} kW`}
            subValue={`PUE: ${((state.it_load_kw + state.cooling_power_kw) / state.it_load_kw).toFixed(3)}`}
          />
          <StatCard 
            icon={<Leaf className="text-emerald-500" />}
            label="Carbon"
            value={`${state.total_carbon.toFixed(1)} kg`}
            subValue={`Intensity: ${state.grid_carbon_intensity}`}
          />
          <StatCard 
            icon={<DollarSign className="text-blue-500" />}
            label="Total Cost"
            value={`$${state.total_cost.toFixed(2)}`}
            subValue={`Step: ${state.step}`}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch">
          {/* Left Column: Visualization */}
          <div className={`lg:col-span-2 flex flex-col space-y-6 sm:space-y-8 ${activeTab !== 'telemetry' && 'hidden lg:block'}`}>
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6 overflow-hidden relative flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Activity size={20} className="text-emerald-500" />
                  Real-time Telemetry
                </h2>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-slate-800 rounded text-[10px] font-mono text-slate-400 uppercase tracking-wider">Live Feed</span>
                </div>
              </div>
              
              <div className="h-40 sm:h-48 w-full mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agent Reward</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="step" 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      hide={window.innerWidth < 640}
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      domain={[0, 1]}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#10b981' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="reward" 
                      stroke="#10b981" 
                      strokeWidth={2} 
                      dot={false} 
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-40 sm:h-48 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PUE</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="step" 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      hide={window.innerWidth < 640}
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      domain={[1, 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#3b82f6' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="pue" 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                      dot={false} 
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-40 sm:h-48 w-full mt-8">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carbon Intensity</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="step" 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      hide={window.innerWidth < 640}
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#f59e0b' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="grid_carbon_intensity" 
                      stroke="#f59e0b" 
                      strokeWidth={2} 
                      dot={false} 
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Solar Output</p>
                  <p className="text-base sm:text-lg font-mono text-amber-500">{state.solar_output_kw.toFixed(1)} kW</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Battery SOC</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${state.battery_soc * 100}%` }}
                        className="h-full bg-blue-500"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-blue-400">{(state.battery_soc * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="space-y-1 sm:text-right col-span-2 sm:col-span-1 border-t sm:border-t-0 border-slate-800 pt-4 sm:pt-0">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Current Reward</p>
                  <p className="text-base sm:text-lg font-mono text-emerald-400">{lastReward ? lastReward.toFixed(4) : '0.0000'}</p>
                </div>
              </div>

              {/* AI Forecast Section */}
              {aiForecast && aiForecast.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-blue-400">
                      <Cloud size={16} />
                      AI Thermal Forecast (3h)
                    </h3>
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest bg-slate-800 px-2 py-0.5 rounded">Gemini 1.5 Flash</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {aiForecast.map((f, i) => (
                      <div key={i} className="bg-slate-800/30 border border-slate-700/50 p-3 rounded-xl space-y-2">
                        <p className="text-[10px] font-bold text-slate-400">{f.time}</p>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500">Amb</span>
                            <span className="text-xs font-mono text-amber-500">{f.ambient.toFixed(1)}°</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500">Int</span>
                            <span className="text-xs font-mono text-emerald-500">{f.internal.toFixed(1)}°</span>
                          </div>
                        </div>
                        <p className="text-[8px] text-slate-500 italic leading-tight">{f.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Wind size={16} className="text-blue-400" />
                  Cooling System
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Efficiency Ratio</span>
                    <span className="text-white font-mono">0.84 COP</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Fan Speed</span>
                    <span className="text-white font-mono">65%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Water Flow</span>
                    <span className="text-white font-mono">12.4 L/s</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Server size={16} className="text-emerald-400" />
                  Infrastructure
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rack Density</span>
                    <span className="text-white font-mono">12 kW/rack</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">PUE (Real-time)</span>
                    <span className="text-white font-mono">{(1 + state.cooling_power_kw / state.it_load_kw).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Uptime SLA</span>
                    <span className="text-emerald-400 font-mono">99.999%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-bold mb-6 flex items-center gap-2">
                  <Activity size={20} className="text-blue-500" />
                  Observation
                </h2>
                <div className="space-y-3">
                  <ObservationItem label="IT Demand" value={`${state.it_load_kw} kW`} />
                  <ObservationItem label="Ambient" value={`${state.ambient_temp_c.toFixed(1)}°C`} />
                  <ObservationItem label="Internal" value={`${state.internal_temp_c.toFixed(1)}°C`} />
                  <ObservationItem label="Solar" value={`${state.solar_output_kw.toFixed(1)} kW`} />
                  <ObservationItem label="Battery" value={`${(state.battery_soc * 100).toFixed(1)}%`} />
                  <ObservationItem label="Carbon" value={`${state.grid_carbon_intensity} g/kWh`} />
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-bold mb-6 flex items-center gap-2">
                  <Cloud size={20} className="text-amber-500" />
                  Task Details
                </h2>
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <h4 className="text-sm font-bold text-white mb-1 uppercase tracking-tight">
                    {taskId.split('-').join(' ')}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {taskId === 'steady-state-efficiency' && "Maintain safe internal temperatures (target 23°C) with a baseline IT load of 800kW. Focus on basic cooling optimization."}
                    {taskId === 'renewable-integration' && "Manage a 500kW solar array and a 500kWh battery (150kW max charge rate). Maximize renewable self-consumption while handling peak IT loads."}
                    {taskId === 'extreme-weather-optimization' && "Navigate a severe heatwave (up to 44°C) with high grid carbon intensity (750 g/kWh). Minimize environmental impact under stress."}
                  </p>
                </div>
                <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <span>Difficulty</span>
                  <span className={
                    taskId === 'steady-state-efficiency' ? 'text-emerald-500' :
                    taskId === 'renewable-integration' ? 'text-amber-500' : 'text-rose-500'
                  }>
                    {taskId === 'steady-state-efficiency' ? 'Easy' :
                     taskId === 'renewable-integration' ? 'Medium' : 'Hard'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Logs */}
          <div className={`flex flex-col space-y-6 sm:space-y-8 ${activeTab === 'telemetry' && 'hidden lg:block'}`}>
            <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6 ${activeTab !== 'controls' && 'hidden lg:block'}`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Wind size={20} className="text-emerald-500" />
                  Controls
                </h2>
                <div className="flex items-center gap-3">
                  {isForecasting && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 animate-pulse">
                      <Loader2 size={12} className="animate-spin" />
                      AI Thinking
                    </div>
                  )}
                  <button 
                    onClick={() => setIsPredictiveCooling(!isPredictiveCooling)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      isPredictiveCooling 
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' 
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    {isPredictiveCooling ? 'Predictive' : 'Manual'}
                  </button>
                </div>
              </div>
              <div className="space-y-6">
                {isPredictiveCooling && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl mb-4"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-emerald-500/70 uppercase">Forecast Insight</span>
                      <span className="text-[10px] font-mono text-emerald-500/50">Next 3h</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {taskId === 'steady-state-efficiency' ? 'Stable conditions expected. Maintaining baseline.' : 
                       'Anticipating thermal shifts. Adjusting setpoints proactively.'}
                    </p>
                  </motion.div>
                )}
                <div className={isPredictiveCooling ? 'opacity-50 pointer-events-none' : ''}>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-widest">Cooling Setpoint</label>
                    <span className="text-xs font-mono text-emerald-400">{coolingSetpoint.toFixed(1)}°C</span>
                  </div>
                  <input 
                    type="range" min="18" max="27" step="0.1"
                    value={coolingSetpoint}
                    onChange={(e) => setCoolingSetpoint(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2">
                      <Battery size={14} className="text-blue-400" />
                      BESS Management
                    </label>
                    <div className="flex items-center gap-2">
                      {batteryChargeRate > 0 ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <ArrowUp size={10} /> Charging
                        </span>
                      ) : batteryChargeRate < 0 ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                          <ArrowDown size={10} /> Discharging
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                          Idle
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <button 
                      onClick={() => setBatteryChargeRate(-1)}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${batteryChargeRate === -1 ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                      Max Discharge
                    </button>
                    <button 
                      onClick={() => setBatteryChargeRate(0)}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${batteryChargeRate === 0 ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                      Idle
                    </button>
                    <button 
                      onClick={() => setBatteryChargeRate(1)}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${batteryChargeRate === 1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                      Max Charge
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] text-slate-500 font-mono">Rate Control</span>
                        <span className="text-xs font-mono text-blue-400">{batteryChargeRate.toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="-1" max="1" step="0.01"
                        value={batteryChargeRate}
                        onChange={(e) => setBatteryChargeRate(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>

                    <div className="h-40 w-full bg-slate-950/50 rounded-xl border border-slate-800 p-3">
                      <div className="flex justify-between items-center mb-3 px-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Battery SoC History</span>
                        <span className="text-[10px] font-mono text-blue-400">{(state.battery_soc * 100).toFixed(1)}%</span>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={telemetryHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis 
                            dataKey="step" 
                            stroke="#475569" 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false}
                            hide
                          />
                          <YAxis 
                            stroke="#475569" 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false}
                            domain={[0, 1]}
                            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '10px' }}
                            itemStyle={{ color: '#3b82f6' }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'SoC']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="battery_soc" 
                            stroke="#3b82f6" 
                            strokeWidth={2} 
                            dot={false} 
                            animationDuration={300}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2">
                      <Cpu size={14} className="text-amber-400" />
                      IT Load Shifting
                    </label>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      itLoadShift > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                      itLoadShift < 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                      'bg-slate-800 border-slate-700 text-slate-500'
                    }`}>
                      {itLoadShift > 0 ? 'Increased' : itLoadShift < 0 ? 'Reduced' : 'Baseline'}
                    </span>
                  </div>
                  
                  <p className="text-[10px] text-slate-500 mb-4 leading-tight">
                    Shift non-critical workloads to optimize for carbon intensity or cooling capacity.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] text-slate-500 font-mono">Shift Intensity</span>
                        <span className="text-xs font-mono text-amber-400">{(itLoadShift * 100).toPrecision(2)}%</span>
                      </div>
                      <input 
                        type="range" min="-0.2" max="0.2" step="0.01"
                        value={itLoadShift}
                        onChange={(e) => setItLoadShift(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-slate-600">-20% (Shed)</span>
                        <span className="text-[8px] text-slate-600">+20% (Burst)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-800/50">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Projected Load</span>
                        <span className="text-sm font-mono text-white">
                          {(state.it_load_kw * (1 + itLoadShift) / (1 + (state.step > 0 ? itLoadShift : 0))).toFixed(0)} kW
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={stepEnv}
                  disabled={state.done || autoStep}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  Apply Manual Step
                </button>
              </div>
            </div>

            <div className={`flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6 ${activeTab !== 'history' && 'hidden lg:block'} flex flex-col`}>
              <h2 className="text-base sm:text-lg font-bold mb-6 flex items-center gap-2">
                <History size={20} className="text-blue-500" />
                Previous Results
              </h2>
              <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar max-h-[400px] lg:max-h-none pr-1">
                {runHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No completed runs yet.</p>
                ) : (
                  runHistory.map((run) => (
                    <div key={run.id} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white uppercase tracking-tight">{run.taskId.split('-').join(' ')}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{new Date(run.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Cost:</span>
                          <span className="text-blue-400">${run.totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Carbon:</span>
                          <span className="text-emerald-400">{run.totalCarbon.toFixed(1)}kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Avg PUE:</span>
                          <span className="text-amber-400">{run.avgPue.toFixed(3)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Steps:</span>
                          <span className="text-white">{run.finalStep}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-800 bg-slate-900/30 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">© 2026 OpenEnv Project. Built for AI Agent Training.</p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-500 transition-colors">Documentation</a>
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-500 transition-colors">OpenEnv Spec</a>
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-500 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>

      {/* Floating Chat Toggle (Mobile/Quick Access) */}
      <button 
        onClick={() => setShowChat(true)}
        className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-500 transition-all z-40 lg:hidden"
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Interface */}
      <AnimatePresence>
        {showChat && (
          <div key="chat-interface-wrapper" className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChat(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[80vh] pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <MessageSquare className="text-blue-500 w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">OpenEnv Assistant</h2>
                    <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Online & Ready
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowChat(false)}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-950/30">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 text-slate-400 p-3 rounded-2xl rounded-tl-none border border-slate-700 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  </div>
                )}
                
                {!isChatLoading && chatMessages.length === 1 && (
                  <div className="pt-4 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Suggested Questions</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedQuestions.map((q, i) => (
                        <button 
                          key={i}
                          onClick={() => processMessage(q)}
                          className="text-xs bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-all text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/50">
                <div className="relative">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about the simulation..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all disabled:opacity-50 disabled:hover:bg-blue-600"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div key="history-modal-wrapper" className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistoryModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <History className="text-blue-500 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Simulation History</h2>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                {runHistory.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-600">
                      <History size={24} />
                    </div>
                    <p className="text-sm text-slate-500">No simulation history found. Complete a run to see results here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {runHistory.map((run) => (
                      <div key={run.id} className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50 space-y-3 hover:border-blue-500/30 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-tight">{run.taskId.split('-').join(' ')}</h4>
                            <p className="text-[10px] text-slate-500 font-mono">{new Date(run.timestamp).toLocaleString()}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] font-bold rounded-full border border-blue-500/20">
                            {run.finalStep} Steps
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/50">
                          <div className="space-y-0.5">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">Cost</p>
                            <p className="text-xs font-mono text-blue-400">${run.totalCost.toFixed(2)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">Carbon</p>
                            <p className="text-xs font-mono text-emerald-400">{run.totalCarbon.toFixed(1)}kg</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[8px] text-slate-500 uppercase font-bold">PUE</p>
                            <p className="text-xs font-mono text-amber-400">{run.avgPue.toFixed(3)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50">
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Knowledge Base Modal */}
      <AnimatePresence mode="wait">
        {showKB && (
          <div key="kb-modal-wrapper" className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKB(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <BookOpen className="text-emerald-500 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Simulation Knowledge Base</h2>
                </div>
                <button 
                  onClick={() => setShowKB(false)}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
                <section>
                  <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                    <Thermometer size={18} />
                    Thermal Dynamics & Cooling
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">
                    The internal temperature is governed by a heat-balance equation. Heat is generated by the 
                    <span className="text-slate-200 font-mono mx-1">IT Load</span> and absorbed from the 
                    <span className="text-slate-200 font-mono mx-1">Ambient Environment</span>. 
                  </p>
                  <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-2">
                    <h4 className="text-xs font-bold text-slate-300 uppercase">Cooling Strategy</h4>
                    <p className="text-xs text-slate-400">
                      The cooling system consumes power proportional to the difference between internal and target temperatures. 
                      Lowering the <span className="text-emerald-400 font-mono">Setpoint</span> increases energy consumption but provides a safety buffer.
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                    <Wind size={18} />
                    Predictive Control
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">
                    Predictive mode uses a 3-hour forecast to optimize thermal mass.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 text-xs text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                      <span><strong>Pre-cooling:</strong> Dropping setpoints early to "store" cold energy before ambient heat spikes.</span>
                    </li>
                    <li className="flex gap-2 text-xs text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                      <span><strong>Load Shedding:</strong> Reducing cooling intensity when ambient temperatures are forecasted to drop.</span>
                    </li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-amber-400 font-bold mb-3 flex items-center gap-2">
                    <Battery size={18} />
                    Energy & Load Management
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                      <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">BESS (Battery Energy Storage System)</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        500kWh capacity with 150kW throughput. Use the battery to <strong>Arbitrage</strong> energy: 
                        charge when solar is high or grid carbon is low, and discharge during peak demand or high carbon intensity.
                      </p>
                    </div>
                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                      <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">IT Load Shifting</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Shift non-critical tasks by up to ±20%. Shifting load to "cooler" times of day reduces the 
                        <strong>PUE (Power Usage Effectiveness)</strong> penalty of the cooling system.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-rose-400 font-bold mb-3 flex items-center gap-2">
                    <Activity size={18} />
                    Reward & Optimization
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    The simulation evaluates performance every 5 minutes (1 step) based on:
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="text-rose-400">Thermal Safety (50%)</span>
                        <span className="text-slate-500">Critical &gt; 30°C</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 w-1/2" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="text-emerald-400">Carbon Minimization (30%)</span>
                        <span className="text-slate-500">Grid vs Renewables</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[30%]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="text-blue-400">Cost Efficiency (20%)</span>
                        <span className="text-slate-500">Dynamic Pricing</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[20%]" />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                  <h3 className="text-emerald-500 font-bold mb-2 flex items-center gap-2">
                    <Info size={18} />
                    Operational Insights
                  </h3>
                  <p className="text-xs text-emerald-500/80 leading-relaxed">
                    <strong>PUE Factor:</strong> A lower PUE means more energy goes to IT and less to cooling. 
                    Aim for a PUE below 1.2 by leveraging ambient cooling when external temperatures are below 20°C.
                  </p>
                </section>
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50">
                <button 
                  onClick={() => setShowKB(false)}
                  className="w-full py-3 bg-emerald-500 text-slate-950 rounded-xl font-bold hover:bg-emerald-400 transition-all"
                >
                  Got it, let's optimize!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value, subValue, trend }: { icon: React.ReactNode, label: string, value: string, subValue: string, trend?: 'normal' | 'danger' }) {
  return (
    <motion.div 
      whileHover={{ y: -4, borderColor: 'rgba(16, 185, 129, 0.3)' }}
      className="bg-slate-900/50 border border-slate-800 p-4 sm:p-6 rounded-2xl transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-700/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex justify-between items-start mb-3 sm:mb-4">
        <div className="p-2 bg-slate-800 rounded-lg group-hover:scale-110 transition-transform">
          {icon}
        </div>
        {trend === 'danger' && (
          <span className="flex items-center gap-1 text-[8px] sm:text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
            Alert
          </span>
        )}
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">{label}</p>
      <h3 className="text-lg sm:text-2xl font-bold text-white tracking-tight mb-1">{value}</h3>
      <p className="text-[9px] sm:text-[10px] font-mono text-slate-400">{subValue}</p>
    </motion.div>
  );
}

function HeaderAction({ icon, onClick, color }: { icon: React.ReactNode, onClick: () => void, color: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'hover:text-emerald-500 hover:bg-emerald-500/10',
    blue: 'hover:text-blue-500 hover:bg-blue-500/10',
    white: 'hover:text-white hover:bg-white/10'
  };
  
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl text-slate-400 transition-all ${colorClasses[color] || 'hover:text-white'}`}
    >
      {icon}
    </button>
  );
}

function MobileTaskBtn({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${active ? 'bg-emerald-500 text-slate-950 border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {label}
    </button>
  );
}

function TabBtn({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${active ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-500'}`}
    >
      {label}
    </button>
  );
}

function ObservationItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-mono text-white">{value}</span>
    </div>
  );
}
