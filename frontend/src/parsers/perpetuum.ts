import { ParserFunc, ScrapedItem } from "../types"

export const perpetuumParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    // Target the links that wrap the event articles
    const eventLinks = doc.querySelectorAll("a.block-link")

    eventLinks.forEach((link) => {
        const titleEl = link.querySelector(".event_title")
        const dateEl = link.querySelector(".event_date")

        if (!titleEl) return

        let url = link.getAttribute("href") || ""
        if (url && !url.startsWith("http")) {
            url = `https://www.perpetuumklub.cz${url.startsWith("/") ? "" : "/"}${url}`
        }

        // const title = titleEl.textContent?.trim() || ""

        // Parse date like "So 14/02"
        let dateStr: string | null = null
        if (dateEl) {
            const rawDate = dateEl.textContent?.trim() || ""
            const match = rawDate.match(/(\d{1,2})\/(\d{1,2})/)
            if (match) {
                const day = match[1].padStart(2, "0")
                const month = match[2].padStart(2, "0")
                const currentYear = new Date().getFullYear()

                // Basic logic to handle year rollover (if month is Jan/Feb and current is Dec)
                // But generally, the current year is the safest bet for a program page.
                dateStr = `${currentYear}-${month}-${day}`
            }
        }

        items.push({
            date: dateStr,
            url,
        })
    })

    return items
}
