import { ScrapedItem } from "../types"

const formatKabinetDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null
    // Input: "úterý 17. 2."
    const match = dateStr.match(/(\d+)\.\s+(\d+)\./)
    if (!match) return null

    const day = match[1].padStart(2, "0")
    const month = match[2].padStart(2, "0")
    const year = new Date().getFullYear()

    return `${year}-${month}-${day}`
}

export const kabinetParser = (htmlString: string): ScrapedItem[] => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, "text/html")
    const baseUrl = "https://www.kabinetmuz.cz"

    // Find all program items inside program__items containers
    const items = Array.from(doc.querySelectorAll(".program__items a.program__item"))

    const events = items.map((el): ScrapedItem => {
        const href = el.getAttribute("href")
        const dateEl = el.querySelector(".program__date")
        const rawDate = dateEl ? dateEl.textContent?.trim() || null : null

        return {
            url: href ? (href.startsWith("http") ? href : baseUrl + href) : "",
            date: formatKabinetDate(rawDate)
        }
    }).filter(event => event.url !== "")

    // Unique by URL
    return Array.from(new Map(events.map(e => [e.url, e])).values())
}
