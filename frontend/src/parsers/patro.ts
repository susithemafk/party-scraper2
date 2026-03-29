import { ParserFunc, ScrapedItem } from "../types"

const MONTH_MAP: Record<string, string> = {
    leden: "01",
    únor: "02",
    březen: "03",
    duben: "04",
    květen: "05",
    červen: "06",
    červenec: "07",
    srpen: "08",
    září: "09",
    říjen: "10",
    listopad: "11",
    prosinec: "12",
}

export const patroParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    const eventArticles = doc.querySelectorAll(".event-list article")

    eventArticles.forEach((article) => {
        const linkEl = article.querySelector("a.event__link") as HTMLAnchorElement
        const titleEl = article.querySelector("h2")
        const dateEl = article.querySelector(".event__date")

        if (!linkEl || !titleEl) return

        let url = linkEl.getAttribute("href") || ""
        // const title = titleEl.textContent?.trim() || ""

        let dateStr: string | null = null
        if (dateEl) {
            const dayText = dateEl.querySelector(".event__day")?.textContent?.trim()?.replace(".", "") || ""
            const monthText = dateEl.querySelector(".event__month")?.textContent?.trim()?.toLowerCase() || ""
            const day = dayText.padStart(2, "0")
            const month = MONTH_MAP[monthText]

            if (day && month) {
                const year = new Date().getFullYear()
                dateStr = `${year}-${month}-${day}`
            }
        }

        items.push({
            date: dateStr,
            url,
        })
    })

    return items
}
