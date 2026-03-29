import React, { useEffect, useState } from "react"
import { useScraper } from "../hooks/useScraper"
import { ParserFunc, ScrapedItem } from "../types"

interface ScraperSectionProps {
    title: string
    defaultUrl: string
    baseUrl: string
    parserFunc: ParserFunc
    onResult?: (title: string, items: ScrapedItem[] | null) => void
    onLoading?: (isLoading: boolean) => void
    onlyToday: boolean
    setOnlyToday: (val: boolean) => void
    weekStart: string
    weekEnd: string
    trigger?: number
    expandTrigger?: number
    collapseTrigger?: number
}

export const ScraperSection: React.FC<ScraperSectionProps> = ({
    title,
    defaultUrl,
    baseUrl,
    parserFunc,
    onResult,
    onLoading,
    onlyToday,
    setOnlyToday,
    weekStart,
    weekEnd,
    trigger,
    expandTrigger,
    collapseTrigger
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const {
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
        maxResults,
        setMaxResults,
        handleFetchAndParse,
        handleManualParse,
        handleCopy,
    } = useScraper(parserFunc, defaultUrl, baseUrl, onlyToday, setOnlyToday, weekStart, weekEnd)

    // Automatically open if loading starts or if results are found
    // useEffect(() => {
        // if (loading) setIsOpen(true)
    // }, [loading])

    // useEffect(() => {
    //     if (result && result.length > 0) setIsOpen(true)
    // }, [result])

    // Trigger fetch when trigger prop changes (e.g., from App.tsx "FETCH ALL")
    useEffect(() => {
        if (trigger && trigger > 0) {
            handleFetchAndParse()
        }
    }, [trigger, handleFetchAndParse])

    useEffect(() => {
        if (onResult) {
            onResult(title, result)
        }
    }, [result, onResult, title])

    useEffect(() => {
        if (onLoading) {
            onLoading(loading)
        }
    }, [loading, onLoading])

    const isEmpty = result !== null && result.length === 0 && !loading
    // Compute a semantic status class for styling based on current state
    const statusClass = error
        ? "status-error"
        : loading
        ? "status-loading"
        : result && result.length > 0
            ? "status-has-results"
            : result !== null && result.length === 0
                ? "status-no-results"
                : "status-idle"

    useEffect(() => {
        if (expandTrigger && expandTrigger > 0) setIsOpen(true)
    }, [expandTrigger])

    useEffect(() => {
        if (collapseTrigger && collapseTrigger > 0) setIsOpen(false)
    }, [collapseTrigger])

    return (
        <div className={`scraper-section ${statusClass} ${isEmpty ? "empty-result" : ""} ${loading ? "is-loading" : ""} ${isOpen ? "is-open" : "is-collapsed"}`}>
            <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <i className={`bi bi-chevron-${isOpen ? "down" : "right"}`} style={{ color: "var(--primary)", fontSize: "0.8rem" }}></i>
                    <h2 className="section-title" style={{ marginBottom: 0, border: "none" }}>{title}</h2>
                    {result && result.length > 0 && <span className="venue-count-badge">{result.length}</span>}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    {loading && (
                        <div className="venue-loading-tag">
                            <span className="dot-pulse"></span>
                            FETCHING...
                        </div>
                    )}
                    {error && !loading && (
                        <div className="venue-status-tag" style={{ color: "#ef4444" }} title={error}>
                            ERROR
                        </div>
                    )}
                    {result && !loading && (
                        <div className="venue-status-tag" style={{ color: result.length > 0 ? "var(--success)" : "#ef4444" }}>
                            {result.length > 0 ? "DONE" : "NO EVENTS"}
                        </div>
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="input-group" style={{ marginTop: "1.5rem", animation: "slideDown 0.2s ease-out" }}>
                <div className="field-label">AUTOMATIC URL:</div>
                <div style={{ display: "flex", gap: "1rem", marginBottom: "0.8rem" }}>
                    <input type="text" placeholder="Enter website URL..." value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>

                <div className="field-label">OR PASTE HTML:</div>
                <textarea
                    placeholder="Paste website source code here if automatic fetch fails..."
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    className="manual-html-textarea"
                />

                <div className="filter-controls">
                    <label>
                        <input type="checkbox" checked={filterPast} onChange={(e) => setFilterPast(e.target.checked)} />
                        Hide Past Events
                    </label>
                    <label>
                        <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} />
                        Only Today
                    </label>
                    <label>
                        <span>Max results:</span>
                        <input type="number" value={maxResults} onChange={(e) => setMaxResults(parseInt(e.target.value) || 0)} />
                    </label>
                </div>

                <div className="button-group">
                    <button onClick={handleFetchAndParse} disabled={loading} style={{ flex: 1 }}>
                        {loading && <span className="loader"></span>}
                        Fetch & Find
                    </button>
                    <button onClick={handleManualParse} disabled={!htmlInput.trim()} className="secondary-button" style={{ flex: 1 }}>
                        Parse Manual HTML
                    </button>
                </div>
                </div>
            )}

            {result && result.length > 0 && (
                <div className="results-section" style={{ marginTop: "1.5rem" }}>
                    <div className="field-label result" style={{ marginBottom: "1rem" }}>
                        FOUND EVENTS: {result.length}
                        <button className="copy-btn" onClick={handleCopy} style={{ background: copied ? "var(--success)" : "rgba(255,255,255,0.05)", fontSize: "0.7rem", padding: "4px 10px" }}>
                            {copied ? "Copied JSON!" : "Copy JSON"}
                        </button>
                    </div>

                    <div className="scraped-items-list">
                        {result.map((item, idx) => (
                            <div key={idx} className="scraped-item">
                                <div className="item-date">{item.date || "No date"}</div>
                                <div className="item-url">
                                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                                        {item.url}
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
