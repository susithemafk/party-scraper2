import { ParserFunc, ScrapedItem } from "../types"

export const bobyhallParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    // Target the links within the grid posts
    const eventLinks = doc.querySelectorAll(".fusion-grid-posts-cards .fusion-title-heading a")

    eventLinks.forEach((link) => {
        const fullText = link.textContent || ""
        if (!fullText.includes("|")) return

        const parts = fullText.split("|").map((p) => p.trim())

        // Parts usually look like: [Title, Date, Time]
        // Example: "THE MUSIC OF THE WALL – IN CONCERT | 28.1.2027 | 17.00"
        // const title = parts[0]
        const rawDate = parts[1] // "28.1.2027"

        let dateStr: string | null = null
        if (rawDate) {
            const match = rawDate.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/)
            if (match) {
                const day = match[1].padStart(2, "0")
                const month = match[2].padStart(2, "0")
                const year = match[3]
                dateStr = `${year}-${month}-${day}`
            }
        }

        const url = link.getAttribute("href") || ""

        items.push({
            date: dateStr,
            url,
        })
    })

    return items
}
