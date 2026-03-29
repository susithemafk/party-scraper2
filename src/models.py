from typing import List, Optional
from pydantic import BaseModel, Field


class EventDetail(BaseModel):
    title: str = Field(..., description="Název akce/párty")
    url: Optional[str] = Field(None, description="Zdrojová URL stránky akce")
    date: Optional[str] = Field(
        None, description="Datum akce ve formátu RRRR-MM-DD")
    time: Optional[str] = Field(None, description="Čas začátku akce")
    place: Optional[str] = Field(None, description="Název klubu/místa konání")
    price: Optional[str] = Field(None, description="Cena vstupného")
    description: Optional[str] = Field(None, description="Stručný popis akce")
    image_url: Optional[str] = Field(
        None, description="URL hlavního obrázku/plakátu")


class EventInput(BaseModel):
    date: str
    url: str
    actions: Optional[List[dict]] = Field(
        None, description="Optional list of crawl4ai actions")
    image_selector: Optional[str] = Field(
        None, description="Optional CSS selector for the main event image")

# Input format: Dict[str, List[EventInput]]
# Example: {"Artbar": [{"date": "...", "url": "..."}]}
