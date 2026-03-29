import { toJpeg } from "html-to-image"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./InstagramGenerator.module.css"

interface StudioEditorProps {
    data: Record<string, any[]>
    onChange: (next: Record<string, any[]>) => void
    selectedCity: string
    cityTitleText: string
}

interface StudioRow {
    id: string
    venue: string
    index: number
    event: Record<string, unknown>
}

const STUDIO_DAY_ORDER_FIELD = "__studio_day_order"

const PREFERRED_FIELDS = [
    "title",
    "event_title",
    "date",
    "time",
    "venue",
    "place",
    "location",
    "price",
    "generated_instagram_image",
    "generated_title_image",
    "generated_image_path",
    "generated_post_image",
    "image_url",
    "image",
    "url",
    "description",
    "tags",
]

const isImageField = (field: string) => {
    const lower = field.toLowerCase()
    return lower.includes("image") || lower.includes("poster") || lower.includes("cover")
}

const toInputValue = (value: unknown) => {
    if (value == null) return ""
    if (Array.isArray(value)) return value.join(", ")
    if (typeof value === "object") {
        try {
            return JSON.stringify(value)
        } catch {
            return ""
        }
    }
    return String(value)
}

const parseInputValue = (raw: string, originalValue: unknown): unknown => {
    if (Array.isArray(originalValue)) {
        return raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
    }

    if (typeof originalValue === "number") {
        const parsed = Number(raw)
        return Number.isNaN(parsed) ? raw : parsed
    }

    if (typeof originalValue === "boolean") {
        return raw.toLowerCase() === "true"
    }

    if (originalValue && typeof originalValue === "object" && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
        try {
            return JSON.parse(raw)
        } catch {
            return raw
        }
    }

    return raw
}

const getGeneratedImagePreview = (event: Record<string, unknown>): string | null => {
    const imageKeys = ["generated_post_image", "generated_instagram_image", "generated_image", "generated_image_path", "instagram_post_image"]

    for (const key of imageKeys) {
        const value = event[key]
        if (typeof value === "string" && value.trim().length > 0) {
            return value
        }
    }

    return null
}

const getSourceImagePreview = (event: Record<string, unknown>): string | null => {
    const imageKeys = ["image_url", "image", "imageUrl", "poster", "cover"]

    for (const key of imageKeys) {
        const value = event[key]
        if (typeof value === "string" && value.trim().length > 0) {
            return value
        }
    }

    return null
}

const resolveImageSrc = (value: string | null): string | null => {
    if (!value) return null

    const trimmed = value.trim()
    if (!trimmed) return null

    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
        return trimmed
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return `http://localhost:8000/proxy-image?url=${encodeURIComponent(trimmed)}`
    }

    return `http://localhost:8000/studio/local-image?path=${encodeURIComponent(trimmed)}`
}

const formatTitleDate = (dateStr: string) => {
    if (!dateStr || dateStr === "Unknown day") return dateStr
    const parts = dateStr.split("-")
    if (parts.length === 3) {
        const [, month, day] = parts
        const monthNumber = Number.parseInt(month, 10)
        const dayNumber = Number.parseInt(day, 10)

        if (!Number.isNaN(monthNumber) && !Number.isNaN(dayNumber)) {
            return `${dayNumber}. ${monthNumber}.`
        }

        return `${day}. ${month}.`
    }
    return dateStr
}

export const StudioEditor: React.FC<StudioEditorProps> = ({ data, onChange, selectedCity, cityTitleText }) => {
    const [isLoadingLatest, setIsLoadingLatest] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isGeneratingAll, setIsGeneratingAll] = useState(false)
    const [isGeneratingAllTitles, setIsGeneratingAllTitles] = useState(false)
    const [hiddenFieldsInput, setHiddenFieldsInput] = useState("generated_title_image, generated_instagram_image, description, place")
    const [saveStatus, setSaveStatus] = useState<string | null>(null)
    const [rowGenerationStatus, setRowGenerationStatus] = useState<Record<string, string>>({})
    const [dayTitleGenerationStatus, setDayTitleGenerationStatus] = useState<Record<string, string>>({})
    const [rowBackgroundDataUrls, setRowBackgroundDataUrls] = useState<Record<string, string>>({})
    const [dayTitleBackgroundByDay, setDayTitleBackgroundByDay] = useState<Record<string, string>>({})
    const [dayTitleBackgroundDataUrls, setDayTitleBackgroundDataUrls] = useState<Record<string, string>>({})
    const dataRef = useRef(data)
    const previewRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const dayTitlePreviewRefs = useRef<Record<string, HTMLDivElement | null>>({})

    useEffect(() => {
        dataRef.current = data
    }, [data])

    const commitData = useCallback(
        (next: Record<string, any[]>) => {
            dataRef.current = next
            onChange(next)
        },
        [onChange],
    )

    const setDayBackgroundFromRow = (day: string, row: StudioRow) => {
        const selectedImage = getSourceImagePreview(row.event) || getGeneratedImagePreview(row.event)
        if (!selectedImage) return

        setDayTitleBackgroundByDay((prev) => ({
            ...prev,
            [day]: selectedImage,
        }))
    }

    const getCaptureImageSource = (value: string | null): string | null => {
        if (!value) return null

        const trimmed = value.trim()
        if (!trimmed) return null

        if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
            return trimmed
        }

        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return `http://localhost:8000/proxy-image?url=${encodeURIComponent(trimmed)}&cb=${Date.now()}`
        }

        return `http://localhost:8000/studio/local-image?path=${encodeURIComponent(trimmed)}&cb=${Date.now()}`
    }

    const fetchImageAsDataUrl = async (url: string): Promise<string> => {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Image fetch failed (${response.status})`)
        }

        const blob = await response.blob()
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error("Failed to convert image to data URL"))
            reader.readAsDataURL(blob)
        })
    }

    const loadLatest = async () => {
        setIsLoadingLatest(true)
        setSaveStatus("Loading latest local JSON...")

        try {
            const response = await fetch(`http://localhost:8000/studio/latest?city=${encodeURIComponent(selectedCity)}`)
            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to load latest JSON")
            }

            const payload = await response.json()
            if (payload?.data && typeof payload.data === "object") {
                onChange(payload.data)
                setSaveStatus(`Loaded (${selectedCity}): ${payload.filename || "latest file"}`)
            } else {
                setSaveStatus("Latest file loaded, but content is empty.")
            }
        } catch (error: any) {
            setSaveStatus(`Load failed: ${error.message}`)
        } finally {
            setIsLoadingLatest(false)
            setTimeout(() => setSaveStatus(null), 4000)
        }
    }

    const saveJsonLocally = async () => {
        setIsSaving(true)
        setSaveStatus("Saving...")

        try {
            const response = await fetch("http://localhost:8000/studio/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: dataRef.current, city: selectedCity }),
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to save JSON")
            }

            const result = await response.json()
            setSaveStatus(`Saved locally (${selectedCity}): ${result.filename}`)
        } catch (error: any) {
            setSaveStatus(`Save failed: ${error.message}`)
        } finally {
            setIsSaving(false)
            setTimeout(() => setSaveStatus(null), 4000)
        }
    }

    const groupedRows = useMemo<Record<string, StudioRow[]>>(() => {
        const groups: Record<string, StudioRow[]> = {}

        Object.entries(data).forEach(([venue, events]) => {
            if (!Array.isArray(events)) return

            events.forEach((event, index) => {
                if (!event || typeof event !== "object") return

                const eventRecord = event as Record<string, unknown>
                const dayRaw = eventRecord.date
                const dayLabel = typeof dayRaw === "string" && dayRaw.trim().length > 0 ? dayRaw : "Unknown day"

                if (!groups[dayLabel]) {
                    groups[dayLabel] = []
                }

                groups[dayLabel].push({
                    id: `${venue}-${index}`,
                    venue,
                    index,
                    event: eventRecord,
                })
            })
        })

        const sortedGroups = Object.entries(groups)
            .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
            .map(([day, rows]) => {
                const sortedRows = [...rows].sort((a, b) => {
                    const aOrder = a.event[STUDIO_DAY_ORDER_FIELD]
                    const bOrder = b.event[STUDIO_DAY_ORDER_FIELD]
                    const aNumber = typeof aOrder === "number" ? aOrder : Number.NaN
                    const bNumber = typeof bOrder === "number" ? bOrder : Number.NaN

                    if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
                        return aNumber - bNumber
                    }

                    if (!Number.isNaN(aNumber)) return -1
                    if (!Number.isNaN(bNumber)) return 1
                    return 0
                })

                return [day, sortedRows]
            })

        return Object.fromEntries(sortedGroups) as Record<string, StudioRow[]>
    }, [data])

    const updateField = (venue: string, index: number, field: string, rawValue: string, originalValue: unknown) => {
        const next = { ...dataRef.current }
        const venueEvents = Array.isArray(next[venue]) ? [...next[venue]] : []
        const currentEvent = venueEvents[index] && typeof venueEvents[index] === "object" ? { ...(venueEvents[index] as Record<string, unknown>) } : {}

        currentEvent[field] = parseInputValue(rawValue, originalValue)
        venueEvents[index] = currentEvent
        next[venue] = venueEvents
        commitData(next)
    }

    const moveRowInDay = (day: string, rowIndex: number, direction: -1 | 1) => {
        const dayRows = groupedRows[day]
        if (!dayRows || dayRows.length === 0) return

        const targetIndex = rowIndex + direction
        if (targetIndex < 0 || targetIndex >= dayRows.length) return

        const reorderedDayRows = [...dayRows]
        const [movedRow] = reorderedDayRows.splice(rowIndex, 1)
        reorderedDayRows.splice(targetIndex, 0, movedRow)

        const next: Record<string, any[]> = {}
        Object.entries(dataRef.current).forEach(([venue, events]) => {
            next[venue] = Array.isArray(events)
                ? events.map((event) =>
                      event && typeof event === "object"
                          ? { ...(event as Record<string, unknown>) }
                          : event,
                  )
                : []
        })

        reorderedDayRows.forEach((row, order) => {
            const venueEvents = Array.isArray(next[row.venue]) ? [...next[row.venue]] : []
            const currentEvent =
                venueEvents[row.index] && typeof venueEvents[row.index] === "object"
                    ? { ...(venueEvents[row.index] as Record<string, unknown>) }
                    : {}

            currentEvent[STUDIO_DAY_ORDER_FIELD] = order + 1
            venueEvents[row.index] = currentEvent
            next[row.venue] = venueEvents
        })

        commitData(next)
    }

    const deleteRow = (venue: string, index: number) => {
        const next = { ...dataRef.current }
        const venueEvents = Array.isArray(next[venue]) ? [...next[venue]] : []

        if (index < 0 || index >= venueEvents.length) return

        venueEvents.splice(index, 1)
        next[venue] = venueEvents
        commitData(next)
    }

    const registerPreviewRef = useCallback((rowId: string, el: HTMLDivElement | null) => {
        previewRefs.current[rowId] = el
    }, [])

    const registerDayTitlePreviewRef = useCallback((day: string, el: HTMLDivElement | null) => {
        dayTitlePreviewRefs.current[day] = el
    }, [])

    const updateFieldForDayRows = useCallback(
        (rows: StudioRow[], field: string, value: string) => {
            const next: Record<string, any[]> = {}

            Object.entries(dataRef.current).forEach(([venue, events]) => {
                next[venue] = Array.isArray(events) ? [...events] : []
            })

            rows.forEach((row) => {
                const venueEvents = Array.isArray(next[row.venue]) ? [...next[row.venue]] : []
                const currentEvent =
                    venueEvents[row.index] && typeof venueEvents[row.index] === "object" ? { ...(venueEvents[row.index] as Record<string, unknown>) } : {}

                currentEvent[field] = value
                venueEvents[row.index] = currentEvent
                next[row.venue] = venueEvents
            })

            commitData(next)
        },
        [commitData],
    )

    const generateRowImage = async (row: StudioRow) => {
        setRowGenerationStatus((prev) => ({ ...prev, [row.id]: "Preparing..." }))

        try {
            const sourceImage = getSourceImagePreview(row.event) || getGeneratedImagePreview(row.event)
            const captureImageUrl = getCaptureImageSource(sourceImage)

            if (captureImageUrl) {
                setRowGenerationStatus((prev) => ({ ...prev, [row.id]: "Loading background..." }))
                let bgSource = captureImageUrl

                try {
                    bgSource = captureImageUrl.startsWith("data:") ? captureImageUrl : await fetchImageAsDataUrl(captureImageUrl)
                } catch {
                    // Continue with proxied/local URL fallback so generation still works.
                    bgSource = captureImageUrl
                }

                setRowBackgroundDataUrls((prev) => ({ ...prev, [row.id]: bgSource }))
            }

            await new Promise((resolve) => setTimeout(resolve, 80))

            const previewEl = previewRefs.current[row.id]
            if (!previewEl) {
                setRowGenerationStatus((prev) => ({ ...prev, [row.id]: "Preview not ready" }))
                return
            }

            const img = previewEl.querySelector("img") as HTMLImageElement | null
            if (img) {
                let attempts = 0
                while (!img.complete && attempts < 50) {
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    attempts++
                }
            }

            setRowGenerationStatus((prev) => ({ ...prev, [row.id]: "Generating..." }))

            const dataUrl = await toJpeg(previewEl, {
                quality: 0.95,
                canvasWidth: 1080,
                canvasHeight: 1080,
                cacheBust: true,
            })

            const title = toInputValue(row.event.title || row.event.event_title || "event")
            const response = await fetch("http://localhost:8000/studio/save-generated-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_base64: dataUrl,
                    filename_hint: `${row.venue}-${title}`,
                }),
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to save generated image")
            }

            const saved = await response.json()
            updateField(row.venue, row.index, "generated_instagram_image", saved.path, row.event.generated_instagram_image)
            setRowGenerationStatus((prev) => ({ ...prev, [row.id]: "Generated" }))
        } catch (error: any) {
            setRowGenerationStatus((prev) => ({ ...prev, [row.id]: `Failed: ${error.message}` }))
        }
    }

    const generateAllImages = async () => {
        const allRows = Object.values(groupedRows).flat() as StudioRow[]
        const dayGroups = Object.entries(groupedRows) as Array<[string, StudioRow[]]>
        if (allRows.length === 0 || dayGroups.length === 0) {
            setSaveStatus("No rows available to generate images.")
            return
        }

        const totalTasks = allRows.length + dayGroups.length
        let completedTasks = 0

        setIsGeneratingAll(true)
        setSaveStatus(`Generating images 0/${totalTasks}...`)

        try {
            for (let i = 0; i < allRows.length; i++) {
                const row = allRows[i]
                await generateRowImage(row)
                completedTasks += 1
                setSaveStatus(`Generating images ${completedTasks}/${totalTasks}...`)
            }

            for (let i = 0; i < dayGroups.length; i++) {
                const [day, rows] = dayGroups[i]
                const dayImages = Array.from(
                    new Set(
                        rows.map((row) => getSourceImagePreview(row.event) || getGeneratedImagePreview(row.event)).filter((value): value is string => !!value),
                    ),
                )
                const preferredImage = dayTitleBackgroundByDay[day]
                const titleImage = preferredImage && dayImages.includes(preferredImage) ? preferredImage : (dayImages[0] ?? null)
                const venuesForDay = Array.from(new Set(rows.map((row) => row.venue).filter(Boolean))).join(" | ")

                await generateDayTitleImage(day, rows, titleImage, venuesForDay)
                completedTasks += 1
                setSaveStatus(`Generating images ${completedTasks}/${totalTasks}...`)
            }

            setSaveStatus(`Generated ${totalTasks} images.`)
        } catch (error: any) {
            setSaveStatus(`Generate all failed: ${error.message}`)
        } finally {
            setIsGeneratingAll(false)
            setTimeout(() => setSaveStatus(null), 4000)
        }
    }

    const generateDayTitleImage = async (day: string, rows: StudioRow[], titleImage: string | null, venuesForDay: string) => {
        setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: "Preparing..." }))

        try {
            const captureImageUrl = getCaptureImageSource(titleImage)
            if (captureImageUrl) {
                setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: "Loading background..." }))
                let bgSource = captureImageUrl

                try {
                    bgSource = captureImageUrl.startsWith("data:") ? captureImageUrl : await fetchImageAsDataUrl(captureImageUrl)
                } catch {
                    bgSource = captureImageUrl
                }

                setDayTitleBackgroundDataUrls((prev) => ({ ...prev, [day]: bgSource }))
            }

            await new Promise((resolve) => setTimeout(resolve, 80))

            const previewEl = dayTitlePreviewRefs.current[day]
            if (!previewEl) {
                setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: "Preview not ready" }))
                return
            }

            const img = previewEl.querySelector("img") as HTMLImageElement | null
            if (img) {
                let attempts = 0
                while (!img.complete && attempts < 50) {
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    attempts++
                }
            }

            setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: "Generating..." }))

            const dataUrl = await toJpeg(previewEl, {
                quality: 0.95,
                canvasWidth: 1080,
                canvasHeight: 1080,
                cacheBust: true,
            })

            const response = await fetch("http://localhost:8000/studio/save-generated-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_base64: dataUrl,
                    filename_hint: `title-${day}-${venuesForDay || "events"}`,
                }),
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to save generated title image")
            }

            const saved = await response.json()
            updateFieldForDayRows(rows, "generated_title_image", saved.path)
            setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: "Generated" }))
        } catch (error: any) {
            setDayTitleGenerationStatus((prev) => ({ ...prev, [day]: `Failed: ${error.message}` }))
        }
    }

    const generateAllTitleImages = async () => {
        const dayGroups = Object.entries(groupedRows) as Array<[string, StudioRow[]]>
        if (dayGroups.length === 0) {
            setSaveStatus("No days available to generate title images.")
            return
        }

        setIsGeneratingAllTitles(true)
        setSaveStatus(`Generating title images 0/${dayGroups.length}...`)

        try {
            for (let i = 0; i < dayGroups.length; i++) {
                const [day, rows] = dayGroups[i]
                const dayImages = Array.from(
                    new Set(
                        rows.map((row) => getSourceImagePreview(row.event) || getGeneratedImagePreview(row.event)).filter((value): value is string => !!value),
                    ),
                )
                const preferredImage = dayTitleBackgroundByDay[day]
                const titleImage = preferredImage && dayImages.includes(preferredImage) ? preferredImage : (dayImages[0] ?? null)
                const venuesForDay = Array.from(new Set(rows.map((row) => row.venue).filter(Boolean))).join(" | ")

                await generateDayTitleImage(day, rows, titleImage, venuesForDay)
                setSaveStatus(`Generating title images ${i + 1}/${dayGroups.length}...`)
            }

            setSaveStatus(`Generated ${dayGroups.length} title images.`)
        } catch (error: any) {
            setSaveStatus(`Generate all title images failed: ${error.message}`)
        } finally {
            setIsGeneratingAllTitles(false)
            setTimeout(() => setSaveStatus(null), 4000)
        }
    }

    const dayEntries = Object.entries(groupedRows) as Array<[string, StudioRow[]]>

    const hiddenFieldsSet = useMemo(() => {
        return new Set(
            hiddenFieldsInput
                .split(",")
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean),
        )
    }, [hiddenFieldsInput])

    const allKnownFields = useMemo(() => {
        return Array.from(
            new Set(
                dayEntries.flatMap(([, rows]) => rows.flatMap((row) => Object.keys(row.event))).filter((field) => !field.startsWith("__studio_")),
            ),
        ).sort((a, b) => a.localeCompare(b))
    }, [dayEntries])

    const exportImages = async () => {
        const items: Array<{ date: string; order: number; image_path: string }> = []

        dayEntries.forEach(([day, rows]) => {
            const dateLabel = day && day !== "Unknown day" ? day : "unknown-day"
            let order = 1

            const generatedTitleImage =
                rows.map((row) => row.event.generated_title_image).find((value): value is string => typeof value === "string" && value.trim().length > 0) ??
                null

            if (generatedTitleImage) {
                items.push({
                    date: dateLabel,
                    order,
                    image_path: generatedTitleImage,
                })
                order += 1
            }

            rows.forEach((row) => {
                const generatedImage = getGeneratedImagePreview(row.event)
                if (!generatedImage) return

                items.push({
                    date: dateLabel,
                    order,
                    image_path: generatedImage,
                })
                order += 1
            })
        })

        if (items.length === 0) {
            setSaveStatus("No generated images available to export.")
            setTimeout(() => setSaveStatus(null), 4000)
            return
        }

        setIsExporting(true)
        setSaveStatus(`Exporting ${items.length} images...`)

        try {
            const response = await fetch("http://localhost:8000/studio/export-images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items, city: selectedCity }),
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err?.detail || "Failed to export images")
            }

            const result = await response.json()
            setSaveStatus(`Exported ${result.saved_count} images to ${result.folder}`)
        } catch (error: any) {
            setSaveStatus(`Export failed: ${error.message}`)
        } finally {
            setIsExporting(false)
            setTimeout(() => setSaveStatus(null), 4000)
        }
    }

    return (
        <div className="studio-page">
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    marginBottom: "1rem",
                }}
            >
                <h1 style={{ margin: 0 }}>Studio</h1>
                <button onClick={loadLatest} className="secondary-button" disabled={isSaving || isLoadingLatest || isGeneratingAll || isGeneratingAllTitles}>
                    {isLoadingLatest ? "Loading..." : "Load Latest JSON"}
                </button>
                <button
                    onClick={generateAllImages}
                    className="secondary-button"
                    disabled={isSaving || isLoadingLatest || isGeneratingAll || isGeneratingAllTitles}
                >
                    {isGeneratingAll ? "Generating All..." : "Generate All Images"}
                </button>
                <button
                    onClick={generateAllTitleImages}
                    className="secondary-button"
                    disabled={isSaving || isLoadingLatest || isGeneratingAll || isGeneratingAllTitles}
                >
                    {isGeneratingAllTitles ? "Generating All Titles..." : "Generate All Title Images"}
                </button>
                <button
                    onClick={saveJsonLocally}
                    className="secondary-button"
                    disabled={isSaving || isLoadingLatest || isGeneratingAll || isGeneratingAllTitles || isExporting}
                >
                    {isSaving ? "Saving..." : "Save Local JSON"}
                </button>
                <button
                    onClick={exportImages}
                    className="secondary-button"
                    disabled={isSaving || isLoadingLatest || isGeneratingAll || isGeneratingAllTitles || isExporting}
                >
                    {isExporting ? "Exporting Images..." : "Export Images"}
                </button>
            </div>
            <p className="subtitle">Edit final event JSON in day-based tables.</p>
            <div style={{ marginBottom: "0.9rem" }}>
                <div style={{ fontSize: "0.82rem", marginBottom: "0.35rem", color: "var(--text-muted)" }}>Hide columns (comma-separated field names)</div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        value={hiddenFieldsInput}
                        onChange={(e) => setHiddenFieldsInput(e.target.value)}
                        placeholder="description, tags, url"
                        className="studio-input"
                        style={{ minWidth: "360px" }}
                    />
                </div>
                {allKnownFields.length > 0 && (
                    <div style={{ fontSize: "0.74rem", marginTop: "0.4rem", color: "var(--text-muted)" }}>Available fields: {allKnownFields.join(", ")}</div>
                )}
            </div>
            {isLoadingLatest && (
                <p className="studio-status" style={{ color: "var(--text-muted)" }}>
                    Loading latest local JSON...
                </p>
            )}
            {saveStatus && (
                <p className="studio-status" style={{ color: "var(--text-muted)" }}>
                    {saveStatus}
                </p>
            )}

            {dayEntries.length === 0 && (
                <div className="scraper-section">
                    <p className="subtitle" style={{ marginBottom: 0 }}>
                        No event data loaded. Click "Load Latest JSON".
                    </p>
                </div>
            )}

            {dayEntries.map(([day, rows]) => {
                // const dayKeys = Array.from(new Set([...rows.flatMap((row) => Object.keys(row.event)), "generated_instagram_image", "url"])).sort((a, b) => {
                const dayKeys = Array.from(new Set([...rows.flatMap((row) => Object.keys(row.event))]))
                    .filter((field) => !field.startsWith("__studio_"))
                    .sort((a, b) => {
                    const aIdx = PREFERRED_FIELDS.indexOf(a)
                    const bIdx = PREFERRED_FIELDS.indexOf(b)
                    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
                    if (aIdx !== -1) return -1
                    if (bIdx !== -1) return 1
                    return a.localeCompare(b)
                })
                const visibleDayKeys = dayKeys.filter((field) => !hiddenFieldsSet.has(field.toLowerCase()))

                return (
                    <section key={day} className="studio-day-section scraper-section">
                        <div className="studio-day-header">
                            <h2 className="section-title">{day}</h2>
                            <span className="venue-count-badge">{rows.length} events</span>
                        </div>

                        <div className="studio-table-wrapper">
                            <table className="studio-table">
                                <thead>
                                    <tr>
                                        <th>order</th>
                                        {/* <th>source image</th> */}
                                        <th>generated image</th>
                                        <th>venue</th>
                                        {visibleDayKeys.map((field) => (
                                            <th key={field}>{field}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, rowIndex) => (
                                        <tr key={row.id}>
                                            <td>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                                    <button
                                                        className="secondary-button"
                                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                                        disabled={rowIndex === 0}
                                                        onClick={() => moveRowInDay(day, rowIndex, -1)}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        className="secondary-button"
                                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                                        disabled={rowIndex === rows.length - 1}
                                                        onClick={() => moveRowInDay(day, rowIndex, 1)}
                                                    >
                                                        ↓
                                                    </button>
                                                    <button
                                                        className="secondary-button"
                                                        style={{
                                                            padding: "0.25rem 0.5rem",
                                                            fontSize: "0.7rem",
                                                            borderColor: "#ef4444",
                                                            color: "#ef4444",
                                                        }}
                                                        onClick={() => deleteRow(row.venue, row.index)}
                                                    >
                                                        Delete
                                                    </button>
                                                    <button
                                                        className="secondary-button"
                                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                                                        disabled={!getSourceImagePreview(row.event) && !getGeneratedImagePreview(row.event)}
                                                        onClick={() => setDayBackgroundFromRow(day, row)}
                                                    >
                                                        Set Day BG
                                                    </button>
                                                </div>
                                            </td>
                                            {/* <td>
                                                {getSourceImagePreview(row.event) ? (
                                                    <img
                                                        src={resolveImageSrc(getSourceImagePreview(row.event)) as string}
                                                        alt="event"
                                                        className="studio-image-preview"
                                                    />
                                                ) : (
                                                    <span className="studio-no-image">No source image</span>
                                                )}
                                            </td> */}
                                            <td>
                                                {getGeneratedImagePreview(row.event) ? (
                                                    <img
                                                        src={resolveImageSrc(getGeneratedImagePreview(row.event)) as string}
                                                        alt="generated"
                                                        className="studio-image-preview"
                                                    />
                                                ) : (
                                                    <span className="studio-no-image">No generated image</span>
                                                )}
                                                <button
                                                    className="secondary-button"
                                                    style={{ marginTop: "0.5rem", padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
                                                    disabled={isGeneratingAll}
                                                    onClick={() => generateRowImage(row)}
                                                >
                                                    Generate Image
                                                </button>
                                                {rowGenerationStatus[row.id] && (
                                                    <div style={{ marginTop: "0.35rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                        {rowGenerationStatus[row.id]}
                                                    </div>
                                                )}
                                                <div className="studio-hidden-generator" aria-hidden="true">
                                                    <div ref={(el) => registerPreviewRef(row.id, el)} className={styles.exportCanvas}>
                                                        {rowBackgroundDataUrls[row.id] ? (
                                                            <img
                                                                src={rowBackgroundDataUrls[row.id]}
                                                                alt={toInputValue(row.event.title || row.event.event_title) || "event"}
                                                                crossOrigin="anonymous"
                                                                className={styles.backgroundImage}
                                                            />
                                                        ) : (
                                                            <div className={styles.fallbackBackground} />
                                                        )}

                                                        <div className={styles.locationContainer}>{toInputValue(row.event.venue || row.venue) || "Brno"}</div>

                                                        <div className={styles.gradientOverlay} />

                                                        <div className={styles.textContent}>
                                                            <div className={styles.timeBadgeContainer}>
                                                                <div className={styles.timeBadge}>
                                                                    DNES {toInputValue(row.event.time) && `| ${toInputValue(row.event.time)}`}
                                                                </div>
                                                            </div>

                                                            <h1 className={styles.actionTitle}>
                                                                {toInputValue(row.event.title || row.event.event_title) || "Název akce"}
                                                            </h1>

                                                            <div className={styles.actionDetails}>
                                                                {toInputValue(row.event.venue || row.venue) && (
                                                                    <div className={styles.detailItem}>{toInputValue(row.event.venue || row.venue)}</div>
                                                                )}
                                                                {toInputValue(row.event.time) && " | "}
                                                                {toInputValue(row.event.time) && (
                                                                    <div className={styles.detailItem}>{toInputValue(row.event.time)}</div>
                                                                )}
                                                                {toInputValue(row.event.price) && " | "}
                                                                {toInputValue(row.event.price) && (
                                                                    <div className={styles.detailItem}>{toInputValue(row.event.price)}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    value={toInputValue(row.event.venue ?? row.venue)}
                                                    onChange={(e) => updateField(row.venue, row.index, "venue", e.target.value, row.event.venue)}
                                                    className="studio-input"
                                                />
                                            </td>
                                            {visibleDayKeys.map((field) => {
                                                const value = row.event[field]
                                                const inputValue = toInputValue(value)
                                                const useTextarea = field === "description" || inputValue.length > 120

                                                return (
                                                    <td key={`${row.id}-${field}`}>
                                                        {useTextarea ? (
                                                            <textarea
                                                                value={inputValue}
                                                                onChange={(e) => updateField(row.venue, row.index, field, e.target.value, value)}
                                                                className="studio-textarea"
                                                            />
                                                        ) : (
                                                            <>
                                                                <input
                                                                    type="text"
                                                                    value={inputValue}
                                                                    onChange={(e) => updateField(row.venue, row.index, field, e.target.value, value)}
                                                                    className="studio-input"
                                                                />
                                                                {field === "url" && inputValue && (
                                                                    <a
                                                                        href={inputValue}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        style={{ fontSize: "0.72rem", display: "inline-block", marginTop: "0.35rem" }}
                                                                    >
                                                                        Open URL
                                                                    </a>
                                                                )}
                                                            </>
                                                        )}
                                                        {isImageField(field) && inputValue && (
                                                            <img
                                                                src={resolveImageSrc(inputValue) || inputValue}
                                                                alt="preview"
                                                                className="studio-inline-image"
                                                            />
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {(() => {
                            const dayImages = Array.from(
                                new Set(
                                    rows
                                        .map((row) => getSourceImagePreview(row.event) || getGeneratedImagePreview(row.event))
                                        .filter((value): value is string => !!value),
                                ),
                            )

                            const preferredImage = dayTitleBackgroundByDay[day]
                            const titleImage = preferredImage && dayImages.includes(preferredImage) ? preferredImage : (dayImages[0] ?? null)

                            const eventPreviewImages = rows.map((row) => getGeneratedImagePreview(row.event)).filter((value): value is string => !!value)
                            const generatedTitleImage =
                                rows
                                    .map((row) => row.event.generated_title_image)
                                    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
                            const venuesForDay = Array.from(new Set(rows.map((row) => row.venue).filter(Boolean))).join(" | ")

                            return (
                                <div style={{ marginTop: "1rem" }}>
                                    <div className="field-label result" style={{ marginBottom: "0.6rem" }}>
                                        FINAL POST PREVIEW
                                    </div>
                                    <div style={{ marginBottom: "0.7rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                        <button
                                            className="secondary-button"
                                            disabled={isGeneratingAll || isGeneratingAllTitles}
                                            onClick={() => generateDayTitleImage(day, rows, titleImage, venuesForDay)}
                                        >
                                            Generate Title Image
                                        </button>
                                        {dayTitleGenerationStatus[day] && (
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{dayTitleGenerationStatus[day]}</span>
                                        )}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: "0.75rem",
                                            overflowX: "auto",
                                            paddingBottom: "0.25rem",
                                            flexWrap: "nowrap",
                                        }}
                                    >
                                        <div className="studio-hidden-generator" aria-hidden="true">
                                            <div ref={(el) => registerDayTitlePreviewRef(day, el)} className={styles.exportCanvas}>
                                                {dayTitleBackgroundDataUrls[day] ? (
                                                    <img
                                                        src={dayTitleBackgroundDataUrls[day]}
                                                        className={styles.backgroundImage}
                                                        crossOrigin="anonymous"
                                                        alt="title background"
                                                    />
                                                ) : (
                                                    <div className={styles.fallbackBackground} />
                                                )}

                                                <div
                                                    className={styles.gradientOverlay}
                                                    style={{
                                                        height: "100%",
                                                        background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 100%)",
                                                    }}
                                                />
                                                <div
                                                    className={styles.textContent}
                                                    style={{
                                                        padding: "84px",
                                                        height: "100%",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        justifyContent: "center",
                                                        alignItems: "center",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    <h1 className={styles.actionTitle} style={{ fontSize: "130px", marginBottom: "42px", WebkitLineClamp: "unset" }}>
                                                        {cityTitleText}
                                                    </h1>
                                                    <div style={{ width: "290px", height: "16px", background: "#306be1", marginBottom: "48px" }} />
                                                    <h2
                                                        className={styles.actionTitle}
                                                        style={{ fontSize: "96px", opacity: 0.95, marginBottom: 0, WebkitLineClamp: "unset" }}
                                                    >
                                                        {formatTitleDate(day)}
                                                    </h2>
                                                    {venuesForDay && (
                                                        <div
                                                            style={{
                                                                fontSize: "36px",
                                                                fontWeight: "800",
                                                                marginTop: "38px",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "5px",
                                                                opacity: 0.85,
                                                                borderTop: "3px solid rgba(255, 255, 255, 0.8)",
                                                                paddingTop: "18px",
                                                                lineHeight: 1.2,
                                                            }}
                                                        >
                                                            {venuesForDay}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                // width: "1080px",
                                                width: "240px",
                                                height: "240px",
                                                border: "1px solid var(--border)",
                                                background: "rgba(15, 23, 42, 0.55)",
                                            }}
                                        >
                                            {generatedTitleImage ? (
                                                <img
                                                    src={resolveImageSrc(generatedTitleImage) || generatedTitleImage}
                                                    alt="title preview"
                                                    style={{ width: "240px", height: "240px", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                                                />
                                            ) : (
                                                <div
                                                    className={styles.exportCanvas}
                                                    style={{ width: "1080px", height: "1080px", minWidth: "1080px", minHeight: "1080px" }}
                                                >
                                                    <div className={styles.fallbackBackground} />
                                                    {titleImage && (
                                                        <img
                                                            src={resolveImageSrc(titleImage) || titleImage}
                                                            className={styles.backgroundImage}
                                                            crossOrigin="anonymous"
                                                            alt="title preview"
                                                        />
                                                    )}

                                                    <div
                                                        className={styles.gradientOverlay}
                                                        style={{
                                                            height: "100%",
                                                            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 100%)",
                                                        }}
                                                    />
                                                    <div
                                                        className={styles.textContent}
                                                        style={{
                                                            padding: "84px",
                                                            height: "100%",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            justifyContent: "center",
                                                            alignItems: "center",
                                                            textAlign: "center",
                                                        }}
                                                    >
                                                        <h1 className={styles.actionTitle} style={{ fontSize: "130px", marginBottom: "42px", WebkitLineClamp: "unset" }}>
                                                            {cityTitleText}
                                                        </h1>
                                                        <div style={{ width: "290px", height: "16px", background: "#306be1", marginBottom: "48px" }} />
                                                        <h2
                                                            className={styles.actionTitle}
                                                            style={{ fontSize: "96px", opacity: 0.95, marginBottom: 0, WebkitLineClamp: "unset" }}
                                                        >
                                                            {formatTitleDate(day)}
                                                        </h2>
                                                        {venuesForDay && (
                                                            <div
                                                                style={{
                                                                    fontSize: "36px",
                                                                    fontWeight: "800",
                                                                    marginTop: "38px",
                                                                    textTransform: "uppercase",
                                                                    letterSpacing: "5px",
                                                                    opacity: 0.85,
                                                                    borderTop: "3px solid rgba(255, 255, 255, 0.8)",
                                                                    paddingTop: "18px",
                                                                    lineHeight: 1.2,
                                                                }}
                                                            >
                                                                {venuesForDay}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {eventPreviewImages.map((img, idx) => (
                                            <div
                                                key={`${day}-preview-${idx}`}
                                                style={{
                                                    // width: "1080px",
                                                    width: "240px",
                                                    height: "240px",
                                                    border: "1px solid var(--border)",
                                                    background: "rgba(15, 23, 42, 0.55)",
                                                }}
                                            >
                                                <img
                                                    src={resolveImageSrc(img) || img}
                                                    alt={`event preview ${idx + 1}`}
                                                    style={{ width: "240px", height: "240px", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })()}
                    </section>
                )
            })}
        </div>
    )
}
