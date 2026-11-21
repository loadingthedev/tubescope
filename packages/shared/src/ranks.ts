export interface RankKeyword {
  id: number;
  channelId: string;
  keyword: string;
  country: string;
  position: number | null;
  change7d: number | null;
  bestVideo: string | null;
  top: { id: string; title: string; channel: string }[];
  history: { day: string; position: number | null }[];
  note: string;
}
export interface RanksResponse {
  keywords: RankKeyword[];
}
export interface RankRemoveResponse {
  removed: number;
}
export interface RankCheckResponse {
  results: { keyword: string; position?: number | null; skipped?: string; error?: string }[];
}
