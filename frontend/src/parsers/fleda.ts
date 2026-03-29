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

export const fledaParser: ParserFunc = (html) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const items: ScrapedItem[] = []

    const eventElements = doc.querySelectorAll(".program-archive > div > div")

    eventElements.forEach((el) => {
        const linkEl = el.querySelector("a.img") as HTMLAnchorElement
        // Title is usually inside h3 or just a link with text
        const titleEl = el.querySelector("h3 a") || el.querySelector("h3") || el.querySelector("h2 a") || el.querySelector(".info h3")
        const dateEl = el.querySelector(".date")

        if (!linkEl) return
        const title = titleEl?.textContent?.trim() || ""
        if (!title) return

        let url = linkEl.getAttribute("href") || ""
        if (url && !url.startsWith("http")) {
            url = `https://www.fleda.cz${url.startsWith("/") ? "" : "/"}${url}`
        }

        let dateStr: string | null = null
        if (dateEl) {
            const dayNum = dateEl.querySelector(".num")?.textContent?.trim()?.padStart(2, "0")
            const monthName = dateEl.querySelector(".month")?.textContent?.trim()?.toLowerCase() || ""
            const yearNum = dateEl.querySelector(".year")?.textContent?.trim()

            const monthNum = MONTH_MAP[monthName]
            if (dayNum && monthNum && yearNum) {
                dateStr = `${yearNum}-${monthNum}-${dayNum}`
            }
        }

        items.push({
            date: dateStr,
            url,
        })
    })

    return items
}
