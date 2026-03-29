import React, { useState, useEffect } from "react"
import { ScrapedItem } from "../types"

interface AiProcessorProps {
    inputData?: (ScrapedItem & { venue?: string })[]
    onComplete?: (results: Record<string, any[]>) => void
    switchToStudio?: () => void
}

export const AiProcessor: React.FC<AiProcessorProps> = ({ inputData = [], onComplete, switchToStudio }) => {
    const [results, setResults] = useState<Record<string, any[]>>({}) // Dictionary format
    const [payload, setPayload] = useState<string>("{}")
    const [loading, setLoading] = useState<boolean>(false)
    const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
    const [copied, setCopied] = useState<boolean>(false)
    const [saveStatus, setSaveStatus] = useState<string | null>(null)
    const [isSavingLocal, setIsSavingLocal] = useState<boolean>(false)

    const saveLocally = async (dataToSave: Record<string, any[]>) => {
        if (Object.keys(dataToSave).length === 0) {
            setSaveStatus("Nothing to save.")
            return
        }

        setIsSavingLocal(true)
        setSaveStatus("Saving extracted JSON locally...")
        try {
            const saveResponse = await fetch("http://localhost:8000/studio/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: dataToSave }),
            })

            if (!saveResponse.ok) {
                const err = await saveResponse.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to save extracted JSON")
            }

            const saveResult = await saveResponse.json()
            setSaveStatus(`Saved locally: ${saveResult.filename}`)
            switchToStudio?.()
        } catch (err: any) {
            setSaveStatus(`Local save failed: ${err.message}`)
        } finally {
            setIsSavingLocal(false)
        }
    }

    // Compute and sync the payload when inputData changes
    useEffect(() => {
        const batchData: Record<string, { url: string; date: string | null }[]> = {}
        inputData.forEach((item) => {
            const venue = item.venue || "Other"
            if (!batchData[venue]) batchData[venue] = []
            batchData[venue].push({ url: item.url, date: item.date })
        })
        setPayload(JSON.stringify(batchData, null, 4))
    }, [inputData])

    // Update parent whenever results change (manual or automatic)
    useEffect(() => {
        if (onComplete && Object.keys(results).length > 0) {
            onComplete(results)
        }
    }, [results, onComplete])

    const handleProcessAi = async () => {
        let finalPayload
        try {
            finalPayload = JSON.parse(payload)
        } catch (e) {
            alert("Invalid JSON in Payload Preview. Please fix it before starting.")
            return
        }

        const totalItems = Object.values(finalPayload).flat().length
        if (totalItems === 0) return

        setLoading(true)
        setResults({}) // Clear as dictionary
        setProgress({ current: 0, total: totalItems })

        let itemsCount = 0
        const currentResults: Record<string, any[]> = {}

        try {
            const response = await fetch("http://localhost:8000/scrape-batch-stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalPayload),
            })

            if (!response.body) throw new Error("No response body")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                    if (!line.trim()) continue
                    try {
                        const chunk = JSON.parse(line) // Format: { "Venue": [event] }
                        const venueName = Object.keys(chunk)[0]
                        const eventData = chunk[venueName][0]

                        if (!currentResults[venueName]) currentResults[venueName] = []

                        // Defensive fallback: ensure URL is always present by mapping
                        // stream item position back to the submitted payload.
                        if (!eventData.url) {
                            const sourceEvents = Array.isArray(finalPayload[venueName]) ? finalPayload[venueName] : []
                            const sourceIdx = currentResults[venueName].length
                            const sourceUrl = sourceEvents[sourceIdx]?.url
                            if (sourceUrl) {
                                eventData.url = sourceUrl
                            }
                        }

                        currentResults[venueName].push(eventData)

                        setResults({ ...currentResults })
                        itemsCount++
                        setProgress((p) => ({ ...p, current: itemsCount }))
                    } catch (e) {
                        console.error("Failed to parse stream line:", e)
                    }
                }
            }
        } catch (err) {
            console.error("Streaming failed:", err)
            alert("Extraction failed. Check if the backend is running.")
        } finally {
            setLoading(false)
            if (onComplete && Object.keys(currentResults).length > 0) {
                onComplete(currentResults)
            }
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(results, null, 4)).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const [resultsText, setResultsText] = useState("{}")
    useEffect(() => {
        setResultsText(JSON.stringify(results, null, 4))
    }, [results])

    const flatResults = Object.values(results).flat()

    return (
        <div className="scraper-section ai-processor" style={{ border: "1px solid var(--primary)", background: "rgba(192, 132, 252, 0.05)" }}>
            <h2 className="section-title">AI Content Processing</h2>
            <p className="description" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
                Send found URLs to the Gemini extraction engine.
            </p>

            <div className="input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <div className="field-label">
                        QUEUE: <span style={{ color: "#c084fc", fontWeight: "bold" }}>{inputData.length} events</span>
                    </div>
                    {flatResults.length > 0 && <div style={{ fontSize: "0.8rem", color: "var(--success)" }}>PROCESSED: {flatResults.length}</div>}
                </div>

                <div className="field-label" style={{ fontSize: "0.7rem", opacity: 0.9, marginBottom: "0.5rem", color: "var(--primary)" }}>
                    API PAYLOAD PREVIEW (EDITABLE):
                </div>
                <textarea
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    style={{
                        width: "100%",
                        height: "400px",
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        background: "rgba(0,0,0,0.5)",
                        color: "#eee",
                        border: "1px solid var(--primary)",
                        borderRadius: "4px",
                        padding: "8px",
                        marginBottom: "1rem",
                        resize: "vertical",
                    }}
                />

                {loading && (
                    <div
                        className="progress-bar-container"
                        style={{
                            width: "100%",
                            height: "8px",
                            background: "rgba(255,255,255,0.1)",
                            borderRadius: "4px",
                            marginBottom: "1rem",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            className="progress-bar-fill"
                            style={{
                                width: `${(progress.current / progress.total) * 100}%`,
                                height: "100%",
                                background: "var(--primary)",
                                transition: "width 0.3s ease",
                            }}
                        />
                    </div>
                )}

                <button
                    onClick={handleProcessAi}
                    disabled={loading || inputData.length === 0}
                    className="fetch-all-btn"
                    style={{
                        background: loading ? "var(--text-muted)" : "linear-gradient(135deg, #c084fc 0%, #a855f7 100%)",
                        width: "100%",
                        padding: "1rem",
                    }}
                >
                    {loading ? (
                        <>
                            ⚡ Extracting {progress.current} / {progress.total}...
                        </>
                    ) : (
                        "🚀 START FULL AI EXTRACTION"
                    )}
                </button>
                {saveStatus && <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>{saveStatus}</div>}
            </div>

            {flatResults.length > 0 && (
                <div className="results-section" style={{ marginTop: "2rem" }}>
                    <div className="field-label result" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>LATEST RESULTS (EDITABLE):</span>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                className="copy-btn"
                                onClick={handleCopy}
                                style={{ background: copied ? "var(--success)" : "rgba(255,255,255,0.1)", fontSize: "0.7rem", padding: "4px 8px" }}
                            >
                                {copied ? "Copied!" : "Copy JSON"}
                            </button>
                        </div>
                    </div>

                    <textarea
                        value={resultsText}
                        onChange={(e) => {
                            setResultsText(e.target.value)
                            try {
                                const parsed = JSON.parse(e.target.value)
                                setResults(parsed)
                            } catch (err) {}
                        }}
                        style={{
                            width: "100%",
                            height: "300px",
                            fontSize: "0.75rem",
                            fontFamily: "monospace",
                            background: "rgba(0,0,0,0.5)",
                            color: "#eee",
                            border: "1px solid var(--success)",
                            borderRadius: "8px",
                            padding: "12px",
                            resize: "vertical",
                            marginBottom: "1rem",
                        }}
                    />
                    <button
                        onClick={() => {
                            saveLocally(results)
                        }}
                        disabled={isSavingLocal}
                        className="fetch-all-btn"
                        style={{
                            background: isSavingLocal ? "var(--text-muted)" : "linear-gradient(135deg, #c084fc 0%, #a855f7 100%)",
                            width: "100%",
                            padding: "1rem",
                        }}
                    >
                        {isSavingLocal ? "Saving..." : "Save Local JSON"}
                    </button>
                </div>
            )}
        </div>
    )
}
