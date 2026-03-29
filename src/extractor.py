import os
import json
from typing import Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv
from .models import EventDetail

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in .env file")

client = genai.Client(api_key=API_KEY)

# Note: google-genai handles configuration slightly differently,
# using config in generate_content instead of model init for some settings.
# Using gemini-2.0-flash as it is high performance and reliable
model_name = "gemini-2.0-flash"


def extract_event_detail(content: str) -> Optional[EventDetail]:
    """
    Extracts structured event details from raw HTML/Markdown content using Gemini.
    """
    prompt = f"""
    You are an expert event data extractor.
    Extract the following information from the provided text content of a party event page.
    Return the result as a JSON object matching this schema:

    {{
        "title": "Name of the event",
        "time": "HH:MM",
        "place": "Venue name",
        "price": "Price info (optional)",
        "description": "Short description",
        "image_url": "Main image URL (optional)"
    }}

    CRITICAL: Output date format '2026-02-14' if text is 'sobota 14. února'
    CRITICAL: Use original langugage.

    If any field is missing, try to infer it from context or use null/empty string appropriately for required fields.

    Content:
    {content[:10000]}
    """

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                top_p=0.95,
                top_k=64,
                max_output_tokens=8192,
                response_mime_type="application/json",
            )
        )

        # Check if the response is valid JSON
        if not response.text:
            print("Empty response from Gemini API")
            return None

        result = json.loads(response.text)

        # If Gemini returns a list, take the first element
        if isinstance(result, list) and len(result) > 0:
            result = result[0]

        if not isinstance(result, dict):
            print(f"Extraction result is not a mapping: {result}")
            return None

        return EventDetail(**result)
    except json.JSONDecodeError:
        print(f"Failed to decode JSON from Gemini response: {response.text if 'response' in locals() else 'No response'}")
        return None
    except Exception as e:
        print(f"Error during extraction or API call: {e}")
        return None
