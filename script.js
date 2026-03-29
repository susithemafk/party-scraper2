console.log("Party Scraper UI initialized successfully!")

const processBtn = document.getElementById("processBtn")
const htmlInput = document.getElementById("htmlInput")

processBtn.addEventListener("click", () => {
    const htmlString = htmlInput.value

    if (htmlString.trim() === "") {
        console.warn("Warning: The input is empty.")
        return
    }

    // Use DOMParser to convert the string into a navigable HTML document
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlString, "text/html")

    // Helper to format Czech date "út 17. 2." -> "2026-02-17"
    const formatCzechDate = (dateStr) => {
        if (!dateStr) return null
        const match = dateStr.match(/(\d+)\.\s*(\d+)\./)
        if (!match) return dateStr

        const day = match[1].padStart(2, "0")
        const month = match[2].padStart(2, "0")
        const year = new Date().getFullYear()

        return `${year}-${month}-${day}`
    }

    // Extract events as objects containing date and URL
    const events = Array.from(doc.querySelectorAll('a[data-hook="ev-rsvp-button"]'))
        .map((btn) => {
            const container = btn.closest(".TYl3A7") || btn.closest(".LbqWhj") || btn.parentElement
            const dateEl = container ? container.querySelector('[data-hook="short-date"]') : null
            const rawDate = dateEl ? dateEl.textContent.trim() : null

            return {
                date: formatCzechDate(rawDate),
                url: btn.getAttribute("href"),
            }
        })
        .filter((event) => event.url !== null)

    // Remove duplicates based on URL
    const uniqueEvents = Array.from(new Map(events.map((e) => [e.url, e])).values())

    // Output to the result textarea
    const resultOutput = document.getElementById("resultOutput")
    resultOutput.value = JSON.stringify(uniqueEvents, null, 4)

    console.log(`--- Found ${uniqueEvents.length} Unique Events ---`)
    console.log(uniqueEvents)

    console.log("--- End of List ---")
})

document.getElementById("copyBtn").addEventListener("click", () => {
    const resultOutput = document.getElementById("resultOutput")
    if (!resultOutput.value) return

    navigator.clipboard
        .writeText(resultOutput.value)
        .then(() => {
            const copyBtn = document.getElementById("copyBtn")
            const originalText = copyBtn.textContent
            copyBtn.textContent = "Copied!"
            copyBtn.style.background = "#22c55e"

            setTimeout(() => {
                copyBtn.textContent = originalText
                copyBtn.style.background = "#334155"
            }, 2000)
        })
        .catch((err) => {
            console.error("Failed to copy: ", err)
        })
})
