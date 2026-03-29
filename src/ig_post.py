from __future__ import annotations

import asyncio
import mimetypes
import traceback
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

import requests


DEFAULT_GRAPH_API_BASE_URL = "https://graph.facebook.com/v25.0"
DEFAULT_TEMP_IMAGE_HOST_UPLOAD_URLS = [
    "https://tmpfiles.org/api/v1/upload",
    "https://0x0.st",
]
DEFAULT_TEMP_IMAGE_HOST_USER_AGENT = "city-events-ig-uploader/1.0 (local script)"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 60


def _safe_upload_filename(path: Path) -> str:
    name = path.name.strip().replace(" ", "-")
    name = "".join(ch for ch in name if ch.isalnum() or ch in ("-", "_", "."))
    if not name or "." not in name:
        suffix = path.suffix if path.suffix else ".jpg"
        return f"image-upload{suffix}"
    if not name[0].isalpha():
        return f"img-{name}"
    return name


def _debug(message: str) -> None:
    print(f"[IG Post] {message}")


def _mask_token(token: str) -> str:
    token = (token or "").strip()
    if not token:
        return ""
    if len(token) <= 10:
        return "*" * len(token)
    return f"{token[:6]}...{token[-4:]}"


def _raise_with_http_context(response: requests.Response, operation: str) -> None:
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        body = (response.text or "").strip().replace("\n", " ")[:1200]
        raise RuntimeError(
            f"{operation} failed (status={response.status_code}) body={body}"
        ) from exc


def _extract_graph_error_message(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or "").strip().replace("\n", " ")[:1200]

    err = payload.get("error", {}) if isinstance(payload, dict) else {}
    message = err.get("message") if isinstance(err, dict) else ""
    code = err.get("code") if isinstance(err, dict) else ""
    subcode = err.get("error_subcode") if isinstance(err, dict) else ""

    parts = []
    if message:
        parts.append(str(message))
    if code != "":
        parts.append(f"code={code}")
    if subcode != "":
        parts.append(f"subcode={subcode}")

    if parts:
        return " | ".join(parts)
    return (response.text or "").strip().replace("\n", " ")[:1200]


def _is_retryable_graph_error(error_message: str) -> bool:
    msg = (error_message or "").lower()
    return (
        "status=500" in msg
        or "status=502" in msg
        or "status=503" in msg
        or "status=504" in msg
        or '"is_transient":true' in msg
        or "code\":2" in msg
    )


def _parse_temp_upload_urls(single_url: str, multiple_urls: str) -> list[str]:
    if multiple_urls:
        return [host.strip() for host in multiple_urls.split(",") if host.strip()]
    if single_url:
        return [single_url.strip()]
    return list(DEFAULT_TEMP_IMAGE_HOST_UPLOAD_URLS)


def _coerce_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def normalize_ig_config(raw: Mapping[str, Any]) -> dict[str, Any]:
    raw_dict = dict(raw or {})

    access_token = str(raw_dict.get("access_token", "")).strip()
    ig_user_id = str(raw_dict.get("ig_user_id", "")).strip()

    upload_urls_raw = raw_dict.get("temp_image_host_upload_urls")
    if isinstance(upload_urls_raw, list):
        upload_urls = [str(url).strip() for url in upload_urls_raw if str(url).strip()]
    else:
        upload_urls = _parse_temp_upload_urls(
            str(raw_dict.get("temp_image_host_upload_url", "")).strip(),
            str(raw_dict.get("temp_image_host_upload_urls", "")).strip(),
        )

    if not upload_urls:
        upload_urls = list(DEFAULT_TEMP_IMAGE_HOST_UPLOAD_URLS)

    image_urls_raw = raw_dict.get("image_urls")
    if isinstance(image_urls_raw, list):
        image_urls = [str(url).strip() for url in image_urls_raw if str(url).strip()]
    else:
        image_urls = []

    graph_api_base_url = str(raw_dict.get("graph_api_base_url", "")).strip() or DEFAULT_GRAPH_API_BASE_URL
    user_agent = str(raw_dict.get("temp_image_host_user_agent", "")).strip() or DEFAULT_TEMP_IMAGE_HOST_USER_AGENT
    timeout = _coerce_int(raw_dict.get("request_timeout_seconds"), DEFAULT_REQUEST_TIMEOUT_SECONDS)

    ret = {
        "access_token": access_token,
        "ig_user_id": ig_user_id,
        "image_urls": image_urls,
        "graph_api_base_url": graph_api_base_url,
        "temp_image_host_upload_urls": upload_urls,
        "temp_image_host_user_agent": user_agent,
        "request_timeout_seconds": timeout,
    }

    _debug(
        "Config loaded: "
        f"ig_user_id={ret['ig_user_id']}, "
        f"graph_api_base_url={ret['graph_api_base_url']}, "
        f"image_urls={len(ret['image_urls'])}, "
        f"temp_hosts={ret['temp_image_host_upload_urls']}, "
        f"timeout={ret['request_timeout_seconds']}, "
        f"access_token={_mask_token(ret['access_token'])}"
    )

    return ret


def validate_required_config(ig_config: Mapping[str, Any]) -> None:
    access_token = str(ig_config.get("access_token", "")).strip()
    ig_user_id = str(ig_config.get("ig_user_id", "")).strip()
    if not access_token or not ig_user_id:
        raise RuntimeError("Missing access_token or ig_user_id in Instagram config")


def is_http_url(value: str) -> bool:
    parsed = urlparse(str(value).strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _tmpfiles_page_to_direct_url(tmpfiles_url: str) -> str:
    parsed = urlparse(tmpfiles_url)
    parts = [part for part in parsed.path.split("/") if part]

    if parsed.netloc.endswith("tmpfiles.org") and len(parts) >= 2:
        file_id = parts[0]
        filename = "/".join(parts[1:])
        return f"https://tmpfiles.org/dl/{file_id}/{filename}"

    return tmpfiles_url


async def validate_instagram_access(ig_config: Mapping[str, Any]) -> None:
    validate_required_config(ig_config)

    check_url = f"{ig_config['graph_api_base_url']}/{ig_config['ig_user_id']}"
    _debug(
        "Preflight check: validating Instagram token/session "
        f"for ig_user_id={ig_config['ig_user_id']}"
    )

    def _do_check() -> dict:
        response = requests.get(
            check_url,
            params={
                "fields": "id,username",
                "access_token": ig_config["access_token"],
            },
            timeout=ig_config["request_timeout_seconds"],
        )
        if response.status_code >= 400:
            details = _extract_graph_error_message(response)
            raise RuntimeError(
                "Instagram token preflight failed "
                f"(status={response.status_code}): {details}"
            )
        return response.json()

    payload = await asyncio.to_thread(_do_check)
    _debug(
        "Preflight check passed: "
        f"id={payload.get('id')}, username={payload.get('username', '<unknown>')}"
    )


async def _upload_with_tmpfiles(image_path: Path, content_type: str, ig_config: Mapping[str, Any]) -> str:
    _debug(f"Uploading via tmpfiles: {image_path.name} (content_type={content_type})")

    def _do_upload() -> str:
        upload_name = _safe_upload_filename(image_path)
        with image_path.open("rb") as image_file:
            files = {"file": (upload_name, image_file, content_type)}
            response = requests.post(
                "https://tmpfiles.org/api/v1/upload",
                files=files,
                timeout=ig_config["request_timeout_seconds"],
                headers={"User-Agent": ig_config["temp_image_host_user_agent"]},
            )

        _raise_with_http_context(response, "tmpfiles upload")
        payload = response.json()

        if payload.get("status") != "success" or "data" not in payload:
            raise RuntimeError(f"tmpfiles.org returned an unexpected payload: {payload}")

        page_url = payload["data"].get("url", "").strip()
        direct_url = _tmpfiles_page_to_direct_url(page_url)

        if not is_http_url(direct_url):
            raise RuntimeError(f"tmpfiles.org returned an invalid URL: {str(page_url)[:200]}")

        return direct_url

    return await asyncio.to_thread(_do_upload)


async def _upload_with_generic_file_host(
    image_path: Path,
    content_type: str,
    upload_url: str,
    ig_config: Mapping[str, Any],
) -> str:
    _debug(
        f"Uploading via temporary host: {upload_url} "
        f"file={image_path.name} (content_type={content_type})"
    )

    def _do_upload() -> str:
        upload_name = _safe_upload_filename(image_path)
        with image_path.open("rb") as image_file:
            files = {"file": (upload_name, image_file, content_type)}
            response = requests.post(
                upload_url,
                files=files,
                timeout=ig_config["request_timeout_seconds"],
                headers={"User-Agent": ig_config["temp_image_host_user_agent"]},
            )

        _raise_with_http_context(response, f"temporary host upload ({upload_url})")
        hosted_url = response.text.strip()

        if not is_http_url(hosted_url):
            raise RuntimeError(
                "Temporary image host returned an unexpected response: "
                f"{hosted_url[:200]}"
            )

        return hosted_url

    return await asyncio.to_thread(_do_upload)


async def upload_local_image(local_path: str, ig_config: Mapping[str, Any]) -> str:
    image_path = Path(local_path).expanduser().resolve()
    _debug(f"Resolving local image: {image_path}")

    if not image_path.is_file():
        raise FileNotFoundError(f"Local image not found: {image_path}")

    content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    upload_errors = []

    for upload_url in ig_config["temp_image_host_upload_urls"]:
        try:
            _debug(f"Trying temp host: {upload_url}")
            parsed = urlparse(upload_url)
            if "tmpfiles.org" in parsed.netloc:
                hosted_url = await _upload_with_tmpfiles(image_path, content_type, ig_config)
            else:
                hosted_url = await _upload_with_generic_file_host(image_path, content_type, upload_url, ig_config)

            print(f"Uploaded local image '{image_path}' via '{upload_url}' to temporary URL: {hosted_url}")
            return hosted_url
        except requests.RequestException as exc:
            response = getattr(exc, "response", None)
            status = response.status_code if response is not None else "N/A"
            body_preview = ""

            if response is not None and response.text:
                body_preview = response.text.strip().replace("\n", " ")[:220]

            upload_errors.append(f"{upload_url} failed (status={status}): {body_preview or str(exc)}")
        except Exception as exc:
            upload_errors.append(f"{upload_url} failed: {exc}")

    raise RuntimeError(
        "All temporary image hosts failed. "
        "Set temp_image_host_upload_urls to working endpoints for your network. "
        f"Details: {' | '.join(upload_errors)}"
    )


async def resolve_image_source(image_source: str, ig_config: Mapping[str, Any]) -> str:
    image_source = str(image_source).strip()

    if is_http_url(image_source):
        return image_source

    return await upload_local_image(image_source, ig_config)


async def create_image_container(image_url: str, ig_config: Mapping[str, Any], caption: str = "") -> str:
    url = f"{ig_config['graph_api_base_url']}/{ig_config['ig_user_id']}/media"
    _debug(
        "Creating image container: "
        f"url={url}, is_single={bool(caption)}, image_url={image_url}"
    )

    if caption:
        payload = {
            "image_url": image_url,
            "caption": caption,
            "access_token": ig_config["access_token"],
        }
    else:
        payload = {
            "image_url": image_url,
            "is_carousel_item": "true",
            "access_token": ig_config["access_token"],
        }

    def _create_container() -> str:
        response = requests.post(
            url,
            data=payload,
            timeout=ig_config["request_timeout_seconds"],
        )
        _raise_with_http_context(response, "create image container")
        return response.json()["id"]

    last_error: RuntimeError | None = None
    for attempt in range(1, 4):
        try:
            container_id = await asyncio.to_thread(_create_container)
            print("Created image container:", container_id)
            return container_id
        except RuntimeError as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_graph_error(str(exc)):
                _debug(f"Transient error creating image container, retrying ({attempt}/3): {exc}")
                await asyncio.sleep(2 * attempt)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Failed to create image container")


async def create_carousel_container(children_ids: list[str], caption: str, ig_config: Mapping[str, Any]) -> str:
    url = f"{ig_config['graph_api_base_url']}/{ig_config['ig_user_id']}/media"
    _debug(
        "Creating carousel container: "
        f"url={url}, children_count={len(children_ids)}"
    )

    payload = {
        "media_type": "CAROUSEL",
        "children": ",".join(children_ids),
        "caption": caption,
        "access_token": ig_config["access_token"],
    }

    def _create_container() -> str:
        response = requests.post(
            url,
            data=payload,
            timeout=ig_config["request_timeout_seconds"],
        )
        _raise_with_http_context(response, "create carousel container")
        return response.json()["id"]

    last_error: RuntimeError | None = None
    for attempt in range(1, 4):
        try:
            carousel_id = await asyncio.to_thread(_create_container)
            print("Created carousel container:", carousel_id)
            return carousel_id
        except RuntimeError as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_graph_error(str(exc)):
                _debug(f"Transient error creating carousel container, retrying ({attempt}/3): {exc}")
                await asyncio.sleep(2 * attempt)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Failed to create carousel container")


async def publish_media(container_id: str, ig_config: Mapping[str, Any]) -> None:
    url = f"{ig_config['graph_api_base_url']}/{ig_config['ig_user_id']}/media_publish"

    payload = {
        "creation_id": container_id,
        "access_token": ig_config["access_token"],
    }

    _debug(
        "Publishing media: "
        f"url={url}, creation_id={container_id}, access_token={_mask_token(ig_config['access_token'])}"
    )

    def _publish() -> dict[str, Any]:
        response = requests.post(
            url,
            data=payload,
            timeout=ig_config["request_timeout_seconds"],
        )
        _raise_with_http_context(response, "publish media")
        return response.json()

    last_error: RuntimeError | None = None
    for attempt in range(1, 4):
        try:
            response_data = await asyncio.to_thread(_publish)
            print("Post published:", response_data)
            return
        except RuntimeError as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_graph_error(str(exc)):
                _debug(f"Transient error publishing media, retrying ({attempt}/3): {exc}")
                await asyncio.sleep(2 * attempt)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Failed to publish media")


async def upload_multiple_images(image_sources: list[str], caption: str, ig_config: Mapping[str, Any]) -> None:
    _debug(f"Starting multi-image upload (count={len(image_sources)})")
    children_ids = []

    for index, image_source in enumerate(image_sources, start=1):
        _debug(f"Processing image {index}/{len(image_sources)}: {image_source}")
        image_url = await resolve_image_source(image_source, ig_config)
        _debug(f"Resolved image {index} URL: {image_url}")
        cid = await create_image_container(image_url, ig_config)
        children_ids.append(cid)
        _debug(f"Created child container {index}: {cid}")

    await asyncio.sleep(5)
    _debug("Slept 5s before carousel container creation")

    carousel_id = await create_carousel_container(children_ids, caption, ig_config)
    _debug(f"Created carousel container: {carousel_id}")

    await asyncio.sleep(5)
    _debug("Slept 5s before publish")

    await publish_media(carousel_id, ig_config)


async def upload_single_image(image_source: str, caption: str, ig_config: Mapping[str, Any]) -> None:
    _debug(f"Starting single-image upload: {image_source}")
    image_url = await resolve_image_source(image_source, ig_config)
    _debug(f"Resolved single image URL: {image_url}")
    container_id = await create_image_container(image_url, ig_config, caption)
    _debug(f"Created single-image container: {container_id}")

    await asyncio.sleep(5)
    await publish_media(container_id, ig_config)


async def upload_media(image_sources: list[str], caption: str, config: Mapping[str, Any]) -> None:
    ig_config = normalize_ig_config(config)
    validate_required_config(ig_config)

    _debug(
        f"upload_media called with {len(image_sources)} image(s), "
        f"caption_len={len(caption or '')}"
    )
    if image_sources:
        _debug(f"Image sources preview: {image_sources[:3]}")

    try:
        await validate_instagram_access(ig_config)
    except Exception as exc:
        _debug(f"Preflight validation failed, aborting upload: {type(exc).__name__}: {exc}")
        raise RuntimeError(
            "Instagram access is not valid anymore. "
            f"Aborting upload. Details: {exc}"
        ) from exc

    try:
        if len(image_sources) == 1:
            _debug("Branch: single image")
            await upload_single_image(image_sources[0], caption, ig_config)
        else:
            _debug("Branch: multiple images")
            await upload_multiple_images(image_sources, caption, ig_config)
    except Exception as exc:
        _debug(f"upload_media failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        raise
