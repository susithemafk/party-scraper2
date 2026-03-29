import { ParserFunc, ScrapedItem } from "../types"

const RA_MONTH_MAP: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
}

export const raParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    // Resident Advisor uses complex data-testids
    const eventCards = doc.querySelectorAll('[data-testid="event-listing-card"]')

    eventCards.forEach((card) => {
        const titleEl = card.querySelector('[data-pw-test-id="event-title"] a') || card.querySelector("h3 a")
        const dateEl = card.querySelector('span[color="secondary"]') || card.querySelector(".Text-sc-wks9sf-0.dhcUaC")

        if (!titleEl) return

        let url = titleEl.getAttribute("href") || ""
        if (url && url.startsWith("/")) {
            url = `https://ra.co${url}`
        }

        // const title = titleEl.textContent?.trim() || ""

        let dateStr: string | null = null
        if (dateEl) {
            // Format is "Sat, 21 Feb"
            const rawDate = dateEl.textContent?.trim() || ""
            const match = rawDate.match(/(\d{1,2})\s+([a-zA-Z]{3})/)
            if (match) {
                const day = match[1].padStart(2, "0")
                const monthName = match[2].toLowerCase()
                const month = RA_MONTH_MAP[monthName]
                const year = new Date().getFullYear()

                if (month) {
                    dateStr = `${year}-${month}-${day}`
                }
            }
        }

        items.push({
            date: dateStr,
            url,
        })
    })

    console.log("Parsed items:", items)

    return items
}
