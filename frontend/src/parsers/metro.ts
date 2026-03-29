import { ParserFunc, ScrapedItem } from "../types"

export const metroParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    // The events are usually within #form-ajax-content
    // The user suggested: #form-ajax-content > div > div > div > div
    const eventElements = doc.querySelectorAll("#form-ajax-content div.item, #form-ajax-content .item-inner, .program .item")

    eventElements.forEach((el) => {
        // Try to find the link which often contains all the info
        const linkEl = el.querySelector("a") as HTMLAnchorElement
        if (!linkEl) return

        const url = linkEl.getAttribute("href") || ""
        if (!url || url === "#") return

        const titleEl = el.querySelector("h2, h3, .title")
        const dateEl = el.querySelector("p.date")

        const title = titleEl?.textContent?.trim() || linkEl.textContent?.split("\n")[0]?.trim() || ""
        if (!title) return

        let dateStr: string | null = null
        const dateSource = dateEl?.textContent || linkEl.textContent || ""

        // Format is "4/02 (20:00)" or "25/02 (17:30)"
        const match = dateSource.match(/(\d{1,2})\/(\d{1,2})/)
        if (match) {
            const day = match[1].padStart(2, "0")
            const month = match[2].padStart(2, "0")
            const year = new Date().getFullYear()
            dateStr = `${year}-${month}-${day}`
        }

        items.push({
            date: dateStr,
            url,
        })
    })

    // Remove duplicates by URL
    return Array.from(new Map(items.map((item) => [item.url, item])).values())
}
