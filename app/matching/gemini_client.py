# file: app/matching/gemini_client.py
"""
Reusable Gemini client for mission structuring (mission_extractor.py).
Same instantiation pattern as cv_json_builder.py's client -- centralized
here as a singleton so /candidates/match doesn't create a new client
per request.
"""

import os
from dotenv import load_dotenv
from google import genai

load_dotenv()


class GeminiMissionClient:
    def __init__(self, model_name: str = "gemini-3.1-flash-lite"):
        gemini_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=gemini_key)
        self.model_name = model_name

    def generate(self, prompt: str) -> str:
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "max_output_tokens": 2000,
            },
        )
        return response.text


_shared_gemini_mission_client = None


def get_gemini_mission_client() -> GeminiMissionClient:
    global _shared_gemini_mission_client
    if _shared_gemini_mission_client is None:
        _shared_gemini_mission_client = GeminiMissionClient()
    return _shared_gemini_mission_client