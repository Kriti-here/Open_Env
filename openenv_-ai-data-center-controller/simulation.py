import time
import random

class OpenEnvSimulation:
    """
    A Python implementation of the OpenEnv Data Center Thermal Simulation.
    Matches the logic used in the AI Controller Dashboard.
    """
    def __init__(self, task_id="steady-state-efficiency"):
        self.task_id = task_id
        self.step_count = 0
        self.it_load = 800.0
        self.ambient_temp = 25.0
        self.internal_temp = 25.0
        self.battery_soc = 0.5
        self.total_cost = 0.0
        self.total_carbon = 0.0
        
    def step(self, cooling_setpoint=22.0, battery_rate=0.0, load_shift=0.0):
        self.step_count += 1
        
        # Simulate physics (simplified OpenEnv logic)
        load_multiplier = 1.0 + load_shift
        current_load = self.it_load * load_multiplier
        
        # Thermal dynamics
        temp_diff = self.ambient_temp - self.internal_temp
        heat_gain = (current_load * 0.01) + (temp_diff * 0.05)
        cooling_effort = max(0, self.internal_temp - cooling_setpoint) * 0.2
        
        self.internal_temp += heat_gain - cooling_effort
        
        # Energy and Carbon
        cooling_power = cooling_effort * 10.0
        total_power = current_load + cooling_power
        
        carbon_intensity = 400 + (100 * random.uniform(-1, 1))
        self.total_carbon += (total_power / 1000.0) * carbon_intensity
        self.total_cost += (total_power / 1000.0) * 0.15
        
        return {
            "step": self.step_count,
            "internal_temp": round(self.internal_temp, 2),
            "pue": round(total_power / current_load, 3),
            "carbon": round(self.total_carbon, 2)
        }

if __name__ == "__main__":
    print("--- OpenEnv Python Simulation Starting ---")
    sim = OpenEnvSimulation()
    
    for i in range(10):
        result = sim.step(cooling_setpoint=21.0)
        print(f"Step {result['step']}: Temp={result['internal_temp']}C, PUE={result['pue']}, Carbon={result['carbon']}kg")
        time.sleep(0.5)
    
    print("--- Simulation Complete ---")
