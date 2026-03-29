import { ScrapedItem } from "../types"

const formatCzechDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null
    const match = dateStr.match(/(\d+)\.\s*(\d+)\./)
    if (!match) return dateStr

    const day = match[1].padStart(2, "0")
    const month = match[2].padStart(2, "0")
    const year = new Date().getFullYear()

    return `${year}-${month}-${day}`
}

export const artbarParser = (htmlString: string): ScrapedItem[] => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, "text/html")

    const events = Array.from(doc.querySelectorAll('a[data-hook="ev-rsvp-button"]'))
        .map((btn): ScrapedItem => {
            const container = btn.closest(".TYl3A7") || btn.closest(".LbqWhj") || btn.parentElement
            const dateEl = container ? container.querySelector('[data-hook="short-date"]') : null
            const rawDate = dateEl ? dateEl.textContent?.trim() || null : null

            return {
                date: formatCzechDate(rawDate),
                url: btn.getAttribute("href") || "",
            }
        })
        .filter((event) => event.url !== "")

    return Array.from(new Map(events.map((e) => [e.url, e])).values())
}
