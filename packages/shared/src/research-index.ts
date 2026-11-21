export interface IndexVideo {
  id: string;
  title: string;
  channel_title: string;
  channel_subs: number;
  views: number;
  x: number | null;
  thumbnail: string;
}
export interface IndexResponse {
  results: IndexVideo[];
  indexed: number;
  note: string;
}
export interface IndexStatsResponse {
  videos: number;
  channels: number;
  outliers: number | null;
  thumbs: number;
  last: { at: string } | null;
  queries: { query: string; source: string; last_run: string | null; runs: number; last_results: number | null }[];
}
export interface IndexCrawlResponse {
  skipped?: string;
  queries?: number;
  added?: number;
  units?: number;
}
export interface IndexQueryResponse {
  added: string;
  note: string;
}
export interface NichesResponse {
  indexed: number;
  niches: { channelId: string; channel: string; subscribers: number; channelAgeDays: number | null; avgX: number; topViews: number; sampleTitles: string[] }[];
}
export interface FormulasResponse {
  sample: number;
  note: string | null;
  formulas: { formula: string; uses: number; medianX: number; examples: { id: string; title: string; channel: string; x: number }[] }[];
}
export interface SimilarThumbnailsResponse {
  compared: number;
  note: string | null;
  results: { videoId: string; title: string | null; channel: string | null; views: number | null; x: number | null; similarity: number; thumbnail: string }[];
}
