from __future__ import annotations

import argparse
import asyncio
from datetime import date
from pathlib import Path
from typing import Dict, List

import yaml

from src import ig_post


ROOT = Path(__file__).resolve().parent
EXPORT_ROOT = ROOT / "studio_data_export"
CONFIG_ROOT = ROOT / "src" / "configs"
ENV_ROOT = ROOT / "src" / "env"
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"}


def load_yaml_config(path: Path) -> Dict:
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as f:
        payload = yaml.safe_load(f) or {}

    return payload if isinstance(payload, dict) else {}


def load_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}

    values: Dict[str, str] = {}
    with path.open("r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue

            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def list_images_for_day(city_dir: Path, day: str) -> List[Path]:
    day_dir = city_dir / day
    if not day_dir.exists() or not day_dir.is_dir():
        return []

    images = [p for p in day_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS]
    return sorted(images, key=lambda p: p.name)


def list_city_days(city_dir: Path) -> List[str]:
    if not city_dir.exists() or not city_dir.is_dir():
        return []

    days = [p.name for p in city_dir.iterdir() if p.is_dir()]
    return sorted(days)


def print_city_report(city_dir: Path, day: str) -> None:
    city = city_dir.name
    config_path = CONFIG_ROOT / f"{city}.yaml"
    env_path = ENV_ROOT / f".env.{city}"

    config = load_yaml_config(config_path)
    env_values = load_env_file(env_path)
    day_images = list_images_for_day(city_dir, day)

    print("=" * 80)
    print(f"City folder: {city}")
    print(f"Export root: {city_dir}")
    print(f"Config file: {config_path} ({'found' if config_path.exists() else 'missing'})")
    print(f"Env file: {env_path} ({'found' if env_path.exists() else 'missing'})")

    if config:
        display_name = config.get("DISPLAY_NAME", city)
        location = config.get("LOCATION", "n/a")
        scrapers = config.get("SCRAPERS", [])
        print(f"Config CITY: {config.get('CITY', city)}")
        print(f"Config DISPLAY_NAME: {display_name}")
        print(f"Config LOCATION: {location}")
        print(f"Configured scrapers: {len(scrapers) if isinstance(scrapers, list) else 0}")
    else:
        print("Config data: n/a")

    if env_values:
        env_keys = ", ".join(sorted(env_values.keys()))
        print(f"Env keys: {env_keys}")
    else:
        print("Env keys: n/a")

    print(f"Date folder checked: {day}")
    if not day_images:
        print("Images for this date: none")
        return

    print(f"Images for this date ({len(day_images)}):")
    for img in day_images:
        print(f" - {img}")


def build_post_config(env_values: Dict[str, str]) -> Dict[str, object]:
    upload_urls = [
        host.strip()
        for host in env_values.get("TEMP_IMAGE_HOST_UPLOAD_URLS", "").split(",")
        if host.strip()
    ]

    if not upload_urls and env_values.get("TEMP_IMAGE_HOST_UPLOAD_URL", "").strip():
        upload_urls = [env_values["TEMP_IMAGE_HOST_UPLOAD_URL"].strip()]

    return {
        "access_token": env_values.get("META_ACCESS_TOKEN", "").strip(),
        "ig_user_id": env_values.get("META_USER_ID", "").strip(),
        "graph_api_base_url": env_values.get("IG_GRAPH_API_BASE_URL", "https://graph.facebook.com/v25.0").strip(),
        "temp_image_host_upload_urls": upload_urls,
        "temp_image_host_user_agent": env_values.get(
            "TEMP_IMAGE_HOST_USER_AGENT",
            "city-events-ig-uploader/1.0 (local script)",
        ).strip(),
        "request_timeout_seconds": int(env_values.get("REQUEST_TIMEOUT_SECONDS", "60") or "60"),
    }


def build_caption(config: Dict, day: str) -> str:
    short_day = day
    try:
        parsed = date.fromisoformat(day)
        short_day = f"{parsed.day}. {parsed.month}."
    except ValueError:
        pass

    template = str(config.get("CAPTION_TEMPLATE", "")).strip()
    if template:
        return template.format(
            date=short_day,
            date_short=short_day,
            date_iso=day,
        )

    city_label = str(config.get("DISPLAY_NAME") or config.get("CITY") or "City")
    return f"Akce v {city_label} {short_day}"


async def maybe_publish_for_city(city_dir: Path, day: str, post_enabled: bool) -> None:
    city = city_dir.name
    config_path = CONFIG_ROOT / f"{city}.yaml"
    env_path = ENV_ROOT / f".env.{city}"

    config = load_yaml_config(config_path)
    env_values = load_env_file(env_path)
    day_images = list_images_for_day(city_dir, day)

    if not post_enabled:
        return

    if not day_images:
        print(f"[POST] {city}: no images for {day}, skipping.")
        return

    post_config = build_post_config(env_values)
    caption = build_caption(config, day)
    image_sources = [str(img) for img in day_images]

    print(f"[POST] {city}: posting {len(image_sources)} image(s) for {day}...")
    await ig_post.upload_media(image_sources, caption, post_config)
    print(f"[POST] {city}: done.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan exported city folders and optionally post via Instagram API.")
    parser.add_argument("--city", required=True, help="City folder/config key (example: brno).")
    parser.add_argument("--post", action="store_true", help="Publish images for the selected city using city env credentials.")
    parser.add_argument("--day", default=None, help="Optional date folder (YYYY-MM-DD). If omitted, all date folders for the city are processed.")
    args = parser.parse_args()

    city = args.city.strip().lower()
    default_day = date.today().isoformat()
    print(f"Posting script started. Current date: {default_day}")
    print(f"Scanning export directory: {EXPORT_ROOT}")
    print(f"Selected city: {city}")

    if not EXPORT_ROOT.exists() or not EXPORT_ROOT.is_dir():
        print("No studio_data_export directory found.")
        return

    city_dir = EXPORT_ROOT / city
    if not city_dir.exists() or not city_dir.is_dir():
        print(f"City folder not found: {city_dir}")
        return

    day_to_process = args.day or default_day

    print_city_report(city_dir, day_to_process)

    if args.post:
        async def _run_posts() -> None:
            await maybe_publish_for_city(city_dir, day_to_process, post_enabled=True)

        asyncio.run(_run_posts())


if __name__ == "__main__":
    main()
