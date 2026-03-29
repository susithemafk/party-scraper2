export interface ScrapedItem {
    url: string;
    date: string | null;
}

export interface ProcessedResult {
    url: string;
    event_title?: string;
    description?: string;
    organizer?: string;
    date?: string;
    time?: string;
    location?: string;
    price?: string;
    tags?: string[];
    error?: string;
}

export type ParserFunc = (htmlString: string) => ScrapedItem[];
