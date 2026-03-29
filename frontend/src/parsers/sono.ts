import { ScrapedItem } from "../types"

const formatSonoDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null
    // Input: "14.02.2026"
    const match = dateStr.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!match) return null

    const day = match[1].padStart(2, "0")
    const month = match[2].padStart(2, "0")
    const year = match[3]

    return `${year}-${month}-${day}`
}

export const sonoParser = (htmlString: string): ScrapedItem[] => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, "text/html")

    // Target the event containers if possible to find the date and link correctly
    // or search for the link and find the date nearby.
    const items = Array.from(doc.querySelectorAll("a.link"))

    const events = items.map((el): ScrapedItem => {
        const href = el.getAttribute("href")

        // Date is in a <p class="date">. We look for it in the same parent container.
        const container = el.closest(".item") || el.closest(".post") || el.parentElement
        const dateEl = container ? container.querySelector("p.date") : null
        const rawDate = dateEl ? dateEl.textContent?.trim() || null : null

        return {
            url: href || "",
            date: formatSonoDate(rawDate)
        }
    }).filter(event => event.url !== "")

    // Unique by URL
    return Array.from(new Map(events.map(e => [e.url, e])).values())
}
