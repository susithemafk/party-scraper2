import { useState, useMemo, useCallback } from "react"
import axios from "axios"
import { ParserFunc, ScrapedItem } from "../types"

export const useScraper = (
    parserFunc: ParserFunc,
    initialUrl: string = "",
    baseUrl: string = "",
    onlyToday: boolean,
    setOnlyToday: (val: boolean) => void,
    weekStart?: string,
    weekEnd?: string,
) => {
    const [url, setUrl] = useState<string>(initialUrl)
    const [htmlInput, setHtmlInput] = useState<string>("")
    const [rawResult, setRawResult] = useState<ScrapedItem[] | null>(null)
    const [loading, setLoading] = useState<boolean>(false)
    const [copied, setCopied] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)

    // Filter settings
    const [filterPast, setFilterPast] = useState<boolean>(false)
    const [maxResults, setMaxResults] = useState<number>(0)

    const result = useMemo(() => {
        if (!rawResult) return null

        let processed = [...rawResult]
        const today = new Date().toISOString().split("T")[0]

        if (filterPast) {
            processed = processed.filter((item) => !item.date || item.date >= today)
        }

        if (onlyToday) {
            processed = processed.filter((item) => item.date === today)
        }

        // Deduplicate by URL
        const seenUrls = new Set<string>()
        processed = processed.filter((item) => {
            if (!item.url) return true // Keep items without URL
            if (seenUrls.has(item.url)) return false
            seenUrls.add(item.url)
            return true
        })

        // Sort by date always
        processed.sort((a, b) => {
            if (!a.date) return 1
            if (!b.date) return -1
            return a.date.localeCompare(b.date)
        })

        if (maxResults > 0) {
            processed = processed.slice(0, maxResults)
        }

        const ws = weekStart ?? ""
        const we = weekEnd ?? ""

        if (ws && we) {
            processed = processed.filter((item) => !!item.date && item.date >= ws && item.date <= we)
        }

        return processed
    }, [rawResult, filterPast, onlyToday, maxResults, weekStart, weekEnd])

    const handleFetchAndParse = useCallback(async () => {
        if (!url.trim()) return
        setLoading(true)
        setRawResult(null)
        setError(null)

        try {
            const response = await axios.post("http://localhost:8000/fetch-html", { url, base_url: baseUrl })
            const html = response.data.html
            const data = parserFunc ? parserFunc(html) : []
            setRawResult(data)
        } catch (err: any) {
            console.error(err)
            const msg = err.response?.data?.detail || err.message
            setError(msg)
            alert(`Fetch failed: ${msg}`)
        } finally {
            setLoading(false)
        }
    }, [url, baseUrl, parserFunc])

    const handleManualParse = useCallback(() => {
        if (!htmlInput.trim()) return
        setError(null)
        const data = parserFunc ? parserFunc(htmlInput) : []
        setRawResult(data)
    }, [htmlInput, parserFunc])

    const handleCopy = useCallback(() => {
        if (!result) return
        navigator.clipboard.writeText(JSON.stringify(result, null, 4)).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }, [result])

    return {
        url,
        setUrl,
        htmlInput,
        setHtmlInput,
        result,
        loading,
        error,
        copied,
        filterPast,
        setFilterPast,
        onlyToday,
        setOnlyToday,
        maxResults,
        setMaxResults,
        handleFetchAndParse,
        handleManualParse,
        handleCopy,
    }
}
