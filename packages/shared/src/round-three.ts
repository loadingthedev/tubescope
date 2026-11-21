// Wire shapes for the read-only research pages. Fields follow existing API services.
export interface AnalyticsOverview {
  period: { startDate: string; endDate: string; days: number };
  totals: Record<string, number>;
  previous: Record<string, number>;
  delta: Record<string, number | null>;
  daily: { day: string; views: number; estimatedMinutesWatched: number; subscribersGained: number; subscribersLost: number }[];
  source: string;
}
export interface AnalyticsVideo {
  video: string;
  title?: string;
  is_short?: number;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
}
export interface AnalyticsTraffic {
  types: { insightTrafficSourceType: string; views: number; share: number }[];
  searchTerms: TrafficDetail[];
  suggestedFrom: TrafficDetail[];
  externalSites: TrafficDetail[];
}
export interface TrafficDetail {
  insightTrafficSourceDetail: string;
  views: number;
}
export interface AnalyticsDemographics {
  rows: { ageGroup: string; gender: string; viewerPercentage: number }[];
}
export interface AnalyticsGeo {
  rows: { country: string; views: number; share: number; averageViewDuration: number }[];
}
export type AnalyticsDevices = { deviceType: string; views: number }[];
export interface AnalyticsContent {
  library: { type: string; count: number; views: number }[];
  analytics: { creatorContentType: string; views: number; estimatedMinutesWatched: number }[];
}
export interface AnalyticsRetention {
  videoId: string;
  curve: { elapsedVideoTimeRatio: number; audienceWatchRatio: number; relativeRetentionPerformance: number }[];
  checkpoints: Record<string, number | null>;
  biggestDrops: { at: number; drop: number }[];
}
export interface AnalyticsWatch {
  publicWatchHours: number;
  subscribers: number;
  note: string;
  daily: { day: string; estimatedMinutesWatched: number }[];
}
export interface AnalyticsRevenue {
  available: boolean;
  reason?: string;
  totals: { revenue: number; rpm: number | null; views: number; monetized: number } | null;
  daily: { day: string; estimatedRevenue: number }[];
}
export interface PackagingAnalysis {
  score: number;
  checks: { name: string; pass: boolean; detail: string; weight?: number }[];
  note?: string;
}
export interface ChapterAnalysis {
  valid: boolean;
  chapters: { time: string; seconds: number; label: string }[];
  errors: string[];
  formatted: string;
}
export interface TagAnalysis {
  tags: string[];
  excluded: { tag: string; reason: string }[];
  charactersUsed: number;
  limit: number;
  note: string;
}
export interface StagedEdit {
  id: number;
  field: string;
  video_title: string | null;
  video_id: string;
  old_value: string | null;
  new_value: string;
  status: string;
  created_at: string;
}
export interface PlaylistSummary {
  id: string;
  title: string;
  description: string;
  count: number;
  privacy?: string;
}
export interface CommentThread {
  id: string;
  videoId: string;
  author: string;
  authorChannelId?: string;
  text: string;
  likes: number;
  published_at: string;
  totalReplies: number;
  ownerReplied: boolean;
  isQuestion: boolean;
  isOwner: boolean;
  replies: { id: string; author: string; text: string; likes: number; published_at: string }[];
}
export interface CommentsResponse {
  total: number;
  shown: number;
  threads: CommentThread[];
}
export interface CommentTemplate {
  id: number;
  name: string;
  body: string;
}
export interface GiveawayResult {
  seed: string;
  eligible: number;
  winners: { author: string; commentId: string; text: string }[];
}
export interface Board {
  id: number;
  name: string;
  items: number;
  channel_id: string | null;
}
export interface BoardItem {
  id: number;
  kind: string;
  ref: { id?: string; title?: string; text?: string };
  note: string | null;
}
export interface Blueprint {
  id: number;
  title: string;
  idea: string;
  audience: string;
  titles: string[];
  thumbnail_notes: string;
  proof: string;
  outline: string;
  status: string;
}
export interface SavedItem {
  id: number;
  kind: string;
  title: string;
  body: string;
}
export interface LocalChange {
  id?: number;
  removed?: number;
  updated?: number;
}
export interface PortfolioResponse {
  generatedAt: string;
  totals: { subscribers: number; views7: number | null; subs7: number | null; alertsOpen: number };
  channels: {
    id: string;
    title: string;
    subscribers: number;
    views7: number | null;
    views7Prev: number | null;
    views7Change: number | null;
    subs7: number | null;
    uploads30: number;
    ctr28: number | null;
    latest: { id: string; title: string; published_at: string; is_short: number; pace: number | null } | null;
    ypp: { watchHours: number; watchHoursPct: number; subs: number; subsPct: number } | null;
  }[];
}
export interface WeeklySummaryResponse {
  text: string;
  sent: { skipped?: string; held?: boolean; id?: number; sent?: string[]; errors?: string[] } | null;
}
export type RpmBands = Record<string, [number, number]>;
export interface EarningsResponse {
  adRevenue: { low: number; mid: number; high: number };
  sponsorships: number;
  affiliate: number;
  total: { low: number; high: number };
  disclaimer: string;
}
export interface ValuationResponse {
  low: number;
  high: number;
  disclaimer: string;
}
export interface AgeComparisonResponse {
  ageDays: number;
  viewsNow: number;
  peerMedianAtSameAge: number;
  index: number | null;
  percentile: number;
  peers: { id: string; title: string; viewsAtAge: number; estimated: boolean }[];
  note: string;
}
export type VideoScoresResponse = Record<string, { score: number; grade: string }>;
