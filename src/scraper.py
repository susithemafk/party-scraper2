from .models import EventDetail
from .extractor import extract_event_detail
from .url_parser import parse_url_config
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from typing import Optional, List, Dict, Any, cast
import asyncio
import logging
import json

logging.basicConfig(
    filename='scraper_debug.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8',
    filemode='w'  # Overwrite log each run
)
logging.info("Starting scraper.py imports...")

logging.info("Imported crawl4ai")
logging.info("Imported extractor")
logging.info("Imported models")


async def process_event(crawler: AsyncWebCrawler, url: str, known_date: Optional[str] = None) -> Optional[EventDetail]:
    """
    Crawls a single URL using the provided crawler instance and extracts details.
    Auto-detects required actions and selectors based on URL.
    """
    logging.info(f"Crawling URL: {url}")

    # Parse URL to get appropriate configuration
    scraping_config = parse_url_config(url)
    actions_data = scraping_config.actions
    selectors = scraping_config.selectors

    config = None
    js_code_blocks = []

    if actions_data:
        logging.info(f"Using custom actions: {actions_data}")
        for action in actions_data:
            a_type = action.get("type")
            if a_type == "wait":
                duration = action.get("duration", 1)
                js_code_blocks.append(
                    f"await new Promise(r => setTimeout(r, {duration * 1000}));")
            elif a_type == "click":
                selector = action.get("selector")
                if selector:
                    js_code_blocks.append(
                        f"(() => {{ let el = document.querySelector('{selector}'); if(el) el.click(); }})();")
            elif a_type == "click_text":
                text = action.get("text")
                if text:
                    # Find and click element containing specific text
                    js_code_blocks.append(
                        f"""(() => {{
                            let elements = Array.from(document.querySelectorAll('*'));
                            let target = elements.find(el => el.textContent && el.textContent.includes('{text}') && !el.querySelector('*'));
                            if (!target) {{
                                target = elements.find(el => el.textContent && el.textContent.includes('{text}'));
                            }}
                            if (target) target.click();
                        }})();""")
            elif a_type == "scroll":
                direction = action.get("direction", "down")
                amount = action.get("amount", 1000)
                if direction == "down":
                    js_code_blocks.append(f"window.scrollBy(0, {amount});")
                else:
                    js_code_blocks.append(f"window.scrollBy(0, -{amount});")

    wait_for = None

    # Build extraction scripts for each selector
    # Keep track of field order for result processing
    extraction_fields = []

    for field_name, selector in selectors.items():
        if not selector:
            continue

        extraction_fields.append(field_name)

        if field_name == "image_url":
            # Only wait for image selector if there are no actions
            if not actions_data:
                wait_for = f"css:{selector}"
            # Small grace period for high-res image swaps
            js_code_blocks.append(
                "await new Promise(r => setTimeout(r, 2000));")

            # Script to extract the best image URL from all matching elements
            extract_image_js = rf"""
            return (() => {{
                let elements = document.querySelectorAll({json.dumps(selector)});
                let candidates = [];

                for (let el of elements) {{
                    let url = null;
                    if (el.tagName === 'IMG') {{
                        url = el.src || el.getAttribute('data-src');
                    }} else {{
                        let style = window.getComputedStyle(el);
                        let bg = style.backgroundImage;
                        if (bg && bg !== 'none') {{
                            let match = bg.match(/url\(["']?(.*?)["']?\)/);
                            if (match) url = match[1];
                        }}
                        if (!url) url = el.getAttribute('data-src') || el.getAttribute('data-original');
                    }}

                    if (url) {{
                        url = url.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                        try {{
                            candidates.push(new URL(url, document.baseURI).href);
                        }} catch(e) {{}}
                    }}
                }}

                if (candidates.length === 0) return null;

                // Heuristic: pick the URL that looks most like a large event image
                let best = candidates.find(u => u.includes('1200') || u.includes('large') || u.includes('/Event/'));
                if (best) return best;

                return candidates.sort((a, b) => b.length - a.length)[0];
            }})();
            """
            js_code_blocks.append(extract_image_js)
        else:
            # For other fields, extract text content
            extract_text_js = rf"""
            return (() => {{
                let el = document.querySelector({json.dumps(selector)});
                return el ? el.textContent.trim() : null;
            }})();
            """
            js_code_blocks.append(extract_text_js)

    config = CrawlerRunConfig(
        js_code=js_code_blocks if js_code_blocks else [],
        wait_for=wait_for if wait_for else "",  # Use empty string instead of None to satisfy strict typing
        cache_mode=CacheMode.BYPASS,
        session_id="session_1",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    # We cast to Any here because Pylance sometimes incorrectly identifies the return type
    # of arun as an AsyncGenerator instead of a CrawlResult in version 0.8.0
    result: Any = await crawler.arun(url=url, config=config)

    if not result.markdown:
        logging.warning(f"No content found for {url}")
        return None

    logging.info(
        f"Extracted content length: {len(result.markdown)} chars. Sending to Gemini...")
    event_detail = extract_event_detail(result.markdown)

    # Process manual extraction results
    if hasattr(result, 'js_execution_result') and result.js_execution_result:
        logging.info(f"JS execution result: {result.js_execution_result}")

    if event_detail and hasattr(result, 'js_execution_result') and result.js_execution_result and extraction_fields:
        results_list = result.js_execution_result.get("results", [])
        if results_list and len(results_list) > 0:
            # Filter to only get string results (ignore action results like {'success': True})
            string_results = [r for r in results_list if isinstance(r, str)]

            # Map extracted results to event detail fields in order
            for idx, field_name in enumerate(extraction_fields):
                if idx < len(string_results) and string_results[idx]:
                    extracted_value = string_results[idx]
                    logging.info(
                        f"Overriding {field_name} with manual extraction: {extracted_value[:100] if len(extracted_value) > 100 else extracted_value}...")
                    setattr(event_detail, field_name, extracted_value)

    if event_detail:
        logging.info(f"Successfully extracted: {event_detail.title}")
        # Backfill date if missing and known
        event_detail.date = known_date
        return event_detail
    else:
        logging.error(f"Failed to extract details for {url}")
        return None


async def process_batch(input_data: dict) -> dict:
    """
    Processes the entire input dictionary structured as {Venue: [List of events]}.
    """
    results = {}

    # Initialize crawler once for the entire batch
    async with AsyncWebCrawler(verbose=True) as crawler:
        for venue, events in input_data.items():
            logging.info(f"Processing venue: {venue}")
            venue_results = []

            for event in events:
                url = event.get('url')
                known_date = event.get('date')

                if not url:
                    continue

                # URL parser will automatically determine actions and selectors
                detail = await process_event(crawler, url, known_date)

                if detail:
                    detail.url = url
                    detail.date = known_date
                    # Enforce venue consistency if missing
                    if not detail.place:
                        detail.place = venue
                    venue_results.append(detail.model_dump())

            results[venue] = venue_results

    return results
