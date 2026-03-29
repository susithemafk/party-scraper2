"""
URL Parser - Maps URLs to their required scraping configuration.
This module determines the appropriate actions and selectors based on URL patterns.
"""
from typing import Optional, TypedDict
from urllib.parse import urlparse
import logging


class EventSelectors(TypedDict, total=False):
    """Type-safe selectors for event detail fields."""
    title: str
    date: str
    time: str
    place: str
    price: str
    description: str
    image_url: str


class ScrapingConfig:
    """Configuration for scraping a specific URL."""

    def __init__(self, actions: list = None, selectors: EventSelectors = None):
        """
        Args:
            actions: List of actions to perform before extraction
            selectors: Dictionary mapping field names to CSS selectors
                      Supported fields: title, date, time, place, price, description, image_url
        """
        self.actions = actions or []
        self.selectors = selectors or {}


def parse_url_config(url: str) -> ScrapingConfig:
    """
    Parse a URL and return the appropriate scraping configuration.

    Args:
        url: The URL to parse

    Returns:
        ScrapingConfig with actions and image_selector for this URL
    """
    parsed = urlparse(url)
    domain = parsed.netloc.lower()

    # Remove www. prefix for easier matching
    if domain.startswith('www.'):
        domain = domain[4:]

    print(f"Domain: {domain}")

    # Domain-specific configurations
    if domain == 'artbar.club':
        return ScrapingConfig(
            actions=[],
            selectors={}
        )

    # TODO test
    elif domain == "facebook.com":
        return ScrapingConfig(
            actions=[
                {"type": "wait", "duration": 3},
                {"type": "click_text", "text": "See more"},
                {"type": "wait", "duration": 1}
            ],
            selectors={
                "image_url": "div[aria-label='Event photo'] img",
            }
        )

    # TODO test
    elif domain == "fairplay.events":
        return ScrapingConfig(
            actions=[],
            selectors={}
        )

    elif domain == "goout.net":
        return ScrapingConfig(
            actions=[],
            selectors={
                "description": "div.markdown",
                "image_url": ".image-header-wrapper img.loaded"
            }
        )

    elif domain == 'eventlook.cz':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "span.wrapper > img",
            }
        )

    elif domain == 'tootoot.fm':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "div.main-img"
            }
        )

    elif domain == 'ticketportal.cz':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "div.detail-header > img"
            }
        )

    # TODO add alterna ale obrazky vpici https://www.alterna.cz/program/hello-marcel-cringe-prince/

    # TODO test
    # elif domain == 'ticketmaster.cz':
    #     return ScrapingConfig(
    #         actions=[],
    #         selectors={
    #             # "image_url": "div.detail-header > img"
    #         }
    #     )

    elif domain == 'sono.cz':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "div.featured-image > img"
            }
        )

    elif domain == 'kabinetmuz.cz':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "div.detail__img"
            }
        )

    elif domain == 'perpetuumklub.cz':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "div.event_image > img"
            }
        )

    elif domain == 'fleda.cz':
        return ScrapingConfig(
            actions=[
                {"type": "wait", "duration": 2},
                {"type": "click", "selector": "div.program-detail > div.clearfix > div.img > div > a > img"},
                {"type": "wait", "duration": 2},
            ],
            selectors={
                "image_url": "img.fancybox-image"
            }
        )

    elif domain == 'smsticket.cz':
        return ScrapingConfig(
            actions=[
                {"type": "wait", "duration": 2},
                {"type": "click", "selector": "div.poster > img"},
                {"type": "wait", "duration": 2},
            ],
            selectors={
                "image_url": "div.featherlight-content > img",
                "date": ".date-place"
            }
        )

    # fraktal
    elif domain == 'ra.co':
        return ScrapingConfig(
            actions=[],
            selectors={
                "image_url": "section[data-tracking-id='event-detail-description'] ul li img",
            }
        )

    # patrobrno NE, lepší smsticket

    # Add more domain patterns here as needed
    # Example with actions:
    # elif domain == 'example.com':
    #     return ScrapingConfig(
    #         actions=[
    #             {"type": "wait", "duration": 2},
    #             {"type": "click", "selector": ".load-more-button"},
    #             {"type": "scroll", "direction": "down", "amount": 1000}
    #         ],
    #         image_selector=".event-image"
    #     )

    # Default configuration (no special handling)
    logging.info(f"No specific config found for {domain}, using defaults")
    return ScrapingConfig()
