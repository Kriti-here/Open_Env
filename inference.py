import os
import json
import requests
from openai import OpenAI
from models import Observation, Action, Reward

# Mandatory Environment Variables
API_BASE_URL = os.getenv("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o")
HF_TOKEN = os.getenv("HF_TOKEN", "")
ENV_URL = os.getenv("ENV_URL", "http://localhost:3000")

# Initialize OpenAI Client
client = OpenAI(
    base_url=API_BASE_URL,
    api_key=HF_TOKEN
)

def get_action_from_llm(state: Observation) -> Action:
    prompt = f"""
    You are an AI agent controlling a sustainable data center.
    Current State: {state.model_dump_json()}
    
    Goal: Minimize carbon and cost while keeping internal temp below 27°C.
    Output a JSON object with:
    - cooling_setpoint (18-27)
    - battery_charge_rate (-1.0 to 1.0)
    - it_load_shift (-0.2 to 0.2)
    """
    
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        response_format={ "type": "json_object" }
    )
    action_data = json.loads(response.choices[0].message.content)
    return Action(**action_data)

def run_inference(task_id: str):
    print(f"[START] task_id={task_id}")
    
    # Reset environment
    response = requests.post(f"{ENV_URL}/reset", json={"task_id": task_id})
    state_data = response.json()
    state = Observation(**state_data)
    
    total_reward = 0
    steps = 0
    
    while not state.done:
        try:
            action = get_action_from_llm(state)
        except Exception as e:
            print(f"Error getting action: {e}")
            action = Action(cooling_setpoint=22, battery_charge_rate=0, it_load_shift=0)
        
        # Step environment
        step_response = requests.post(f"{ENV_URL}/step", json=action.model_dump())
        result_data = step_response.json()
        
        reward_obj = Reward(**result_data)
        state = Observation(**result_data["observation"])
        
        total_reward += reward_obj.reward
        steps += 1
        
        # Strict [STEP] format
        print(f"[STEP] step={steps} reward={reward_obj.reward:.4f} done={state.done}")
            
    print(f"[END] task_id={task_id} total_reward={total_reward:.4f} steps={steps}")

if __name__ == "__main__":
    tasks = ["steady-state-efficiency", "renewable-integration", "extreme-weather-optimization"]
    for task in tasks:
        run_inference(task)
