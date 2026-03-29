import React, { useState, useCallback, useMemo, useEffect } from "react"
import "./App.css"
import { ScraperSection } from "./components/ScraperSection"
import { AiProcessor } from "./components/AiProcessor"
import { StudioEditor } from "./components/StudioEditor"
import { artbarParser } from "./parsers/artbar"
import { kabinetParser } from "./parsers/kabinet"
import { sonoParser } from "./parsers/sono"
import { fledaParser } from "./parsers/fleda"
import { perpetuumParser } from "./parsers/perpetuum"
import { patroParser } from "./parsers/patro"
import { metroParser } from "./parsers/metro"
import { raParser } from "./parsers/ra"
import { bobyhallParser } from "./parsers/bobyhall"
import { ScrapedItem } from "./types"

type ParserKey = "artbar" | "kabinet" | "sono" | "fleda" | "perpetuum" | "patro" | "metro" | "ra" | "bobyhall"

interface ScraperConfig {
    title: string
    url: string
    baseUrl: string
    parser: ParserKey
}

interface CityConfig {
    CITY: string
    DISPLAY_NAME?: string
    CAPTION_TEMPLATE?: string
    SCRAPERS: ScraperConfig[]
}

interface CityOption {
    city: string
    displayName: string
}

const PARSER_MAP = {
    artbar: artbarParser,
    kabinet: kabinetParser,
    sono: sonoParser,
    fleda: fledaParser,
    perpetuum: perpetuumParser,
    patro: patroParser,
    metro: metroParser,
    ra: raParser,
    bobyhall: bobyhallParser,
}

const getLocalIsoDate = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

const App: React.FC = () => {
    const [triggerAll, setTriggerAll] = useState(0)
    const [expandAllCounter, setExpandAllCounter] = useState(0)
    const [collapseAllCounter, setCollapseAllCounter] = useState(0)
    const [allResults, setAllResults] = useState<Record<string, ScrapedItem[]>>({})
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})
    const [aiResults, setAiResults] = useState<Record<string, any[]>>({})
    const [studioData, setStudioData] = useState<Record<string, any[]>>({})
    const [copiedAll, setCopiedAll] = useState(false)
    const [globalOnlyToday, setGlobalOnlyToday] = useState(false)
    const [cities, setCities] = useState<CityOption[]>([])
    const [selectedCity, setSelectedCity] = useState("brno")
    const [cityConfig, setCityConfig] = useState<CityConfig | null>(null)
    const [isCityLoading, setIsCityLoading] = useState(false)
    const [rangeStart, setRangeStart] = useState("")
    const [rangeEnd, setRangeEnd] = useState("")
    const [view, setView] = useState<"scraper" | "studio">("scraper")

    const venues = useMemo(() => cityConfig?.SCRAPERS ?? [], [cityConfig])

    const getWeekBounds = useCallback((dateStr: string) => {
        const parts = dateStr.split("-").map((value) => Number.parseInt(value, 10))
        if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
            return { start: dateStr, end: dateStr, label: dateStr }
        }

        const [year, month, dayOfMonth] = parts
        const base = new Date(Date.UTC(year, month - 1, dayOfMonth))
        const day = base.getUTCDay()
        const diffToMonday = day === 0 ? -6 : 1 - day

        const monday = new Date(base)
        monday.setUTCDate(base.getUTCDate() + diffToMonday)

        const sunday = new Date(monday)
        sunday.setUTCDate(monday.getUTCDate() + 6)

        const toIso = (d: Date) => {
            const year = d.getUTCFullYear()
            const month = String(d.getUTCMonth() + 1).padStart(2, "0")
            const date = String(d.getUTCDate()).padStart(2, "0")
            return `${year}-${month}-${date}`
        }

        const toShort = (d: Date) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`

        return {
            start: toIso(monday),
            end: toIso(sunday),
            label: `${toShort(monday)} - ${toShort(sunday)}`,
        }
    }, [])

    const handleFetchAll = useCallback(() => {
        setAllResults({})
        setTriggerAll((prev) => prev + 1)
    }, [])

    useEffect(() => {
        const loadCities = async () => {
            try {
                const response = await fetch("http://localhost:8000/config/cities")
                if (!response.ok) return
                const payload = await response.json()
                const nextCities = Array.isArray(payload?.cities) ? payload.cities : []
                if (nextCities.length > 0) {
                    setCities(nextCities)
                    setSelectedCity(nextCities[0].city)
                }
            } catch {
                // Keep default city and static fallback behavior when backend config endpoint is unavailable.
            }
        }

        loadCities()
    }, [])

    useEffect(() => {
        const loadCityConfig = async () => {
            setIsCityLoading(true)
            try {
                const response = await fetch(`http://localhost:8000/config/city/${encodeURIComponent(selectedCity)}`)
                if (!response.ok) {
                    throw new Error("Failed to load city config")
                }

                const payload = (await response.json()) as CityConfig
                const safeScrapers = Array.isArray(payload?.SCRAPERS)
                    ? payload.SCRAPERS.filter((scraper) => !!scraper && !!PARSER_MAP[scraper.parser])
                    : []

                setCityConfig({
                    ...payload,
                    CITY: payload?.CITY || selectedCity,
                    SCRAPERS: safeScrapers,
                })
            } catch {
                // Fallback to empty config when backend config cannot be loaded.
                setCityConfig({ CITY: selectedCity, DISPLAY_NAME: selectedCity, SCRAPERS: [] })
            } finally {
                setIsCityLoading(false)
            }
        }

        setAllResults({})
        setAiResults({})
        setStudioData({})
        setLoadingStates({})
        setTriggerAll(0)
        loadCityConfig()
    }, [selectedCity])

    const handleLoading = useCallback((title: string, isLoading: boolean) => {
        setLoadingStates((prev) => {
            if (prev[title] === isLoading) return prev
            return { ...prev, [title]: isLoading }
        })
    }, [])

    const handleAiComplete = useCallback((results: Record<string, any[]>) => {
        setAiResults(results)
    }, [])

    const handleResult = useCallback((title: string, items: ScrapedItem[] | null) => {
        if (items) {
            setAllResults((prev) => {
                // Only update if the items have actually changed to avoid unnecessary re-renders
                if (prev[title] === items) return prev
                return { ...prev, [title]: items }
            })
        }
    }, [])

    const aggregatedResults = useMemo(() => {
        // Flatten with venue info included
        const flattened = Object.entries(allResults).flatMap(([venue, items]) => items.map((item) => ({ ...item, venue })))

        // Deduplicate by URL
        const seenUrls = new Set<string>()
        const unique = flattened.filter((item) => {
            if (!item.url) return true
            if (seenUrls.has(item.url)) return false
            seenUrls.add(item.url)
            return true
        })

        return unique.sort((a, b) => {
            if (!a.date) return 1
            if (!b.date) return -1
            return a.date.localeCompare(b.date)
        })
    }, [allResults])

    const selectedWeek = useMemo(() => {
        const anchor = getLocalIsoDate()
        return getWeekBounds(anchor)
    }, [getWeekBounds])

    useEffect(() => {
        if (!rangeStart) setRangeStart(selectedWeek.start)
        if (!rangeEnd) setRangeEnd(selectedWeek.end)
    }, [rangeStart, rangeEnd, selectedWeek])

    const effectiveRangeStart = rangeStart || selectedWeek.start
    const effectiveRangeEnd = rangeEnd || selectedWeek.end

    const weekFilteredAggregatedResults = useMemo(
        () =>
            aggregatedResults.filter(
                (item) => !!item.date && item.date >= effectiveRangeStart && item.date <= effectiveRangeEnd,
            ),
        [aggregatedResults, effectiveRangeStart, effectiveRangeEnd],
    )

    const handleCopyAll = useCallback(() => {
        const output: Record<string, { date: string | null; url: string }[]> = {}

        weekFilteredAggregatedResults.forEach((item) => {
            const venue = item.venue || "Other"
            if (!output[venue]) output[venue] = []
            output[venue].push({
                date: item.date,
                url: item.url,
            })
        })

        if (Object.keys(output).length === 0) return

        navigator.clipboard.writeText(JSON.stringify(output, null, 4)).then(() => {
            setCopiedAll(true)
            setTimeout(() => setCopiedAll(false), 2000)
        })
    }, [weekFilteredAggregatedResults])

    const hasAiResults = Object.keys(aiResults).length > 0
    const baseResults = useMemo(() => (hasAiResults ? aiResults : allResults), [hasAiResults, aiResults, allResults])

    useEffect(() => {
        if (Object.keys(studioData).length === 0) {
            setStudioData(baseResults)
        }
    }, [baseResults, studioData])

    const finalResults = Object.keys(studioData).length > 0 ? studioData : baseResults

    const studioTitleText = useMemo(() => {
        const captionTemplate = (cityConfig?.CAPTION_TEMPLATE || "").split("\n")[0]?.trim()
        if (captionTemplate) {
            const cleaned = captionTemplate
                .replace(/\{date_short\}|\{date_iso\}|\{date\}/g, "")
                .replace(/\s+/g, " ")
                .trim()
            if (cleaned) {
                return cleaned.toLocaleUpperCase("cs-CZ")
            }
        }

        return `AKCE V ${(cityConfig?.DISPLAY_NAME || selectedCity).toLocaleUpperCase("cs-CZ")}`
    }, [cityConfig, selectedCity])

    const activeScrapersCount = Object.values(loadingStates).filter(Boolean).length
    const isAnyLoading = activeScrapersCount > 0

    return (
        <div className="container">
            <div>
                <div
                    className="view-selector"
                    style={{
                        display: "flex",
                        gap: "1rem",
                        justifyContent: "center",
                        marginBottom: "2rem",
                    }}
                >
                    <button
                        onClick={() => setView("scraper")}
                        style={{
                            padding: "0.5rem 1.5rem",
                            borderRadius: "2rem",
                            border: "1px solid var(--primary)",
                            background: view === "scraper" ? "var(--primary)" : "transparent",
                            color: "white",
                            cursor: "pointer",
                        }}
                    >
                        Scraper Dashboard
                    </button>
                    <button
                        onClick={() => setView("studio")}
                        style={{
                            padding: "0.5rem 1.5rem",
                            borderRadius: "2rem",
                            border: "1px solid var(--primary)",
                            background: view === "studio" ? "var(--primary)" : "transparent",
                            color: "white",
                            cursor: "pointer",
                        }}
                    >
                        Studio
                    </button>
                </div>

                <div className="main-content-wrapper" style={{ display: view === "scraper" ? "block" : "none" }}>
                    <h1>Party Scraper</h1>
                    <p className="subtitle">Automated Event Intelligence</p>

                    <div
                        className="bulk-controls"
                        style={{
                            marginBottom: "2rem",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "1rem",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <div style={{ position: "relative" }}>
                            <button onClick={handleFetchAll} className="fetch-all-btn" disabled={isAnyLoading || isCityLoading || venues.length === 0}>
                                {isAnyLoading ? `FETCHING... (${activeScrapersCount}/${venues.length})` : `FETCH ALL SCRAPERS (${venues.length})`}
                            </button>
                            {isAnyLoading && <div className="fetching-loader-bar"></div>}
                        </div>

                        <label
                            className="global-filter"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                fontSize: "0.9rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            CITY
                            <select
                                value={selectedCity}
                                onChange={(e) => setSelectedCity(e.target.value)}
                                style={{
                                    background: "#0f172a",
                                    color: "#e2e8f0",
                                    border: "1px solid var(--border)",
                                    borderRadius: "0.4rem",
                                    padding: "0.4rem 0.6rem",
                                }}
                            >
                                {cities.map((city) => (
                                    <option key={city.city} value={city.city}>
                                        {city.displayName}
                                    </option>
                                ))}
                                {cities.length === 0 && <option value={selectedCity}>{selectedCity}</option>}
                            </select>
                        </label>

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                className="secondary-button"
                                style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}
                                onClick={() => setExpandAllCounter((prev) => prev + 1)}
                            >
                                <i className="bi bi-arrows-expand"></i> OPEN ALL
                            </button>
                            <button
                                className="secondary-button"
                                style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}
                                onClick={() => setCollapseAllCounter((prev) => prev + 1)}
                            >
                                <i className="bi bi-arrows-collapse"></i> CLOSE ALL
                            </button>
                        </div>

                        <label
                            className="global-filter"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={globalOnlyToday}
                                onChange={(e) => setGlobalOnlyToday(e.target.checked)}
                                style={{
                                    width: "1.1rem",
                                    height: "1.1rem",
                                    accentColor: "var(--primary)",
                                }}
                            />
                            ONLY TODAY (GLOBAL)
                        </label>
                        <label
                            className="global-filter"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                fontSize: "0.9rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            FROM
                            <input
                                type="date"
                                value={effectiveRangeStart}
                                onChange={(e) => setRangeStart(e.target.value)}
                                style={{
                                    background: "#0f172a",
                                    color: "#e2e8f0",
                                    border: "1px solid var(--border)",
                                    borderRadius: "0.4rem",
                                    padding: "0.4rem 0.6rem",
                                }}
                            />
                            TO
                            <input
                                type="date"
                                value={effectiveRangeEnd}
                                onChange={(e) => setRangeEnd(e.target.value)}
                                style={{
                                    background: "#0f172a",
                                    color: "#e2e8f0",
                                    border: "1px solid var(--border)",
                                    borderRadius: "0.4rem",
                                    padding: "0.4rem 0.6rem",
                                }}
                            />
                        </label>

                        {weekFilteredAggregatedResults.length > 0 && (
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <button
                                    onClick={handleCopyAll}
                                    className="copy-btn"
                                    style={{
                                        background: copiedAll ? "var(--success)" : "var(--primary)",
                                    }}
                                >
                                    {copiedAll ? "Copied All (JSON)!" : `Copy All (${weekFilteredAggregatedResults.length})`}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="main-content">
                        <AiProcessor inputData={weekFilteredAggregatedResults} onComplete={handleAiComplete} switchToStudio={() => setView("studio")} />

                        {venues.map((venue) => (
                            <ScraperSection
                                key={venue.title}
                                title={venue.title}
                                defaultUrl={venue.url}
                                baseUrl={venue.baseUrl}
                                parserFunc={PARSER_MAP[venue.parser]}
                                onResult={handleResult}
                                onLoading={(isLoading) => handleLoading(venue.title, isLoading)}
                                onlyToday={globalOnlyToday}
                                setOnlyToday={setGlobalOnlyToday}
                                weekStart={effectiveRangeStart}
                                weekEnd={effectiveRangeEnd}
                                trigger={triggerAll}
                                expandTrigger={expandAllCounter}
                                collapseTrigger={collapseAllCounter}
                            />
                        ))}
                    </div>
                </div>

                <div className="studio-wrapper" style={{ display: view === "studio" ? "block" : "none" }}>
                    <StudioEditor data={finalResults} onChange={setStudioData} selectedCity={selectedCity} cityTitleText={studioTitleText} />
                </div>
            </div>
        </div>
    )
}

export default App
