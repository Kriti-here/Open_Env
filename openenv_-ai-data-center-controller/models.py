from pydantic import BaseModel, Field
from typing import Dict, Optional

class Observation(BaseModel):
    step: int = Field(..., description="Current simulation step")
    it_load_kw: float = Field(..., description="Current IT power demand in kW")
    ambient_temp_c: float = Field(..., description="Outside air temperature in Celsius")
    internal_temp_c: float = Field(..., description="Data center internal temperature in Celsius")
    grid_carbon_intensity: float = Field(..., description="Grid carbon intensity in gCO2/kWh")
    solar_output_kw: float = Field(..., description="Solar power generation in kW")
    battery_soc: float = Field(..., description="Battery State of Charge (0.0 to 1.0)")
    cooling_power_kw: float = Field(..., description="Power consumed by cooling systems in kW")
    total_cost: float = Field(..., description="Cumulative cost incurred")
    total_carbon: float = Field(..., description="Cumulative carbon emissions")
    done: bool = Field(..., description="Whether the episode is finished")
    task_id: str = Field(..., description="ID of the current task")

class Action(BaseModel):
    cooling_setpoint: float = Field(..., ge=18, le=27, description="Target internal temperature")
    battery_charge_rate: float = Field(..., ge=-1.0, le=1.0, description="Battery charge (>0) or discharge (<0) rate")
    it_load_shift: float = Field(..., ge=-0.2, le=0.2, description="Shift non-critical load (-20% to +20%)")

class Reward(BaseModel):
    reward: float = Field(..., ge=0.0, le=1.0, description="Normalized reward value")
    info: Dict[str, float] = Field(default_factory=dict, description="Additional diagnostic information")
