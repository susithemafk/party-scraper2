import { ScrapedItem } from "../types"

export const defaultParser = (htmlString: string): ScrapedItem[] => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, "text/html")

    // Simple default: Get all links that look like they might be events
    const links = Array.from(doc.querySelectorAll("a"))
        .filter((a) => a.href && (a.href.includes("event") || a.textContent?.toLowerCase().includes("rsvp")))
        .map((a): ScrapedItem => ({
            url: a.href,
            date: null,
        }))

    return Array.from(new Map(links.map((e) => [e.url, e])).values())
}
