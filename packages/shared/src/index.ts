// JSON wire shapes from apps/api route handlers and their service return values.
// This package has no runtime exports or dependency on Bun/SQLite.
export type SettingsResponse = Record<string, string>;

export interface QuotaToday {
  day: string;
  units: number;
  calls: number;
  cached: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
  resetsInMinutes: number;
}
export interface QuotaResponse {
  today: QuotaToday;
  history: { day: string; units: number; calls: number; cached: number | null }[];
  ai: { day: string; feature: string; calls: number; ok: number; ms: number | null }[];
}

export interface Channel {
  id: string;
  title: string | null;
  handle: string | null;
  thumbnail: string | null;
  description: string | null;
  country: string | null;
  kind: 'owned' | 'competitor';
  uploads_playlist: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  published_at: string | null;
  added_at: string;
  last_synced: string | null;
  authorized: boolean;
  oauth_email: string | null;
}
export type ChannelsResponse = Channel[];

export interface KeywordSuggestion {
  keyword: string;
  source: 'autocomplete' | 'alphabet' | 'question';
  words: number;
}
export interface KeywordExploreResponse {
  seed: string;
  country: string;
  total: number;
  autocomplete: string[];
  longTail: KeywordSuggestion[];
  questions: KeywordSuggestion[];
  modifiers: string[];
  all: KeywordSuggestion[];
  source: string;
}
export interface KeywordDemandResponse {
  keyword: string;
  country: string;
  demandIndex: number;
  band: 'high' | 'moderate' | 'low' | 'minimal';
  components: Record<string, number>;
  weights: Record<string, number>;
  regionsPresent: string[];
  homeRank: number | null;
  note: string;
}

export interface Video {
  id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string;
  thumbnail: string;
  published_at: string;
  tags: string[];
  category_id: string;
  duration_sec: number;
  is_short: boolean;
  is_live: boolean;
  view_count: number;
  like_count: number;
  comment_count: number;
}
export interface CompetitionVideo extends Video {
  channel_subs: number | null;
  age_days: number;
  exact_in_title: boolean;
  partial_in_title: boolean;
  vpd: number;
}
export interface KeywordCompetitionResponse {
  keyword: string;
  country: string;
  sampleSize: number;
  totalResultsReported: number | null;
  medianViews: number;
  medianChannelSubs: number;
  recentShare: number;
  exactTitleShare: number;
  smallChannelShare: number;
  opportunityScore: number;
  components: { smallChannelsRanking: number; freshContentRanking: number; titleGap: number; demandProxy: number };
  formula: string;
  results: CompetitionVideo[];
  source: string;
}
export interface OutlierVideo extends Video {
  channelMedianViews?: number | null;
  baselineSample?: number;
  outlierX?: number | null;
  channel_subs: number;
  channel_videos: number;
  channel_thumbnail?: string;
  age_days: number;
  vpd: number;
  subs_ratio: number;
  breakout_score: number;
}
export interface OutlierSearchResponse {
  baselinePartial?: boolean;
  query: string;
  sampleSize: number;
  results: OutlierVideo[];
  source: string;
}
export interface CompetitorMetrics {
  id: string;
  title: string | null;
  thumbnail: string | null;
  handle: string | null;
  kind: 'owned' | 'competitor';
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  created: string | null;
  viewsPerVideo: number;
  uploadsLastN: number;
  uploadsPerWeek: number;
  medianViewsLong: number;
  medianViewsShorts: number;
  recentMedianViews: number;
  engagement: number;
  subsGrowthN: number | null;
  viewsGrowthN: number | null;
  snapshotDays: number;
  librarySynced: number;
}
export interface CompetitorComparisonResponse {
  days: number;
  channels: CompetitorMetrics[];
  note: string;
}

export interface LocalOutlierVideo extends Video {
  channel_subs: number;
  baseline_median: number;
  outlier_x: number;
  velocity_x: number;
  vpd: number;
  sample: number;
  subs_ratio: number | null;
}
export interface FeedVideo extends Video {
  channel_subs: number;
}
export interface CompetitorAlert {
  id: number;
  title: string;
  kind: string;
  read: number;
  created_at: string;
  payload: { videoId?: string; channelId?: string };
}

export type ChannelHistoryResponse = { day: string; views: number; subs: number; videos: number }[];
export interface PerformanceSegment {
  median: number;
  breakout: Video[];
  above: Video[];
  typical: number;
  under: Video[];
}
export interface ChannelSegmentsResponse {
  long: PerformanceSegment;
  shorts: PerformanceSegment;
}
export interface ChannelVideosResponse {
  total: number;
  videos: Video[];
}
export interface ChannelScoreResponse {
  channelId: string;
  score: number;
  grade: string;
  advice: string;
  components: Record<string, number>;
  weights: Record<string, number>;
  sample: { videos: number; recent90d: number; snapshotDays: number };
}
export interface DashboardIdea {
  id: number;
  best_title: string;
  angle: string;
  score: number | null;
  predicted_x: number | null;
}
export type IdeasResponse = DashboardIdea[];
export type AnalyticsMetric =
  | 'views'
  | 'estimatedMinutesWatched'
  | 'averageViewDuration'
  | 'averageViewPercentage'
  | 'subscribersGained'
  | 'subscribersLost'
  | 'likes'
  | 'comments'
  | 'shares';
export interface AnalyticsOverviewResponse {
  totals: Partial<Record<AnalyticsMetric, number>>;
  delta: Partial<Record<AnalyticsMetric, number | null>>;
  daily: { day: string; views: number }[];
}
export interface ChannelSyncResponse {
  synced: number;
  metadataChanges: number;
}

export interface OAuthUrlResponse {
  url: string;
}
export interface SettingField {
  key: string;
  group: string;
  type: string;
  description: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  local?: boolean;
  values?: string[];
  pattern?: string;
  value: string | number | boolean;
  set: boolean;
  isDefault: boolean;
}
export interface ConfigResponse {
  groups: string[];
  settings: SettingField[];
}
export interface ChecklistCheck {
  name: string;
  pass: boolean;
  detail: string;
}
export interface VideoChecklistResponse {
  score: number;
  items: { item: string; pass: boolean; detail: string }[];
  title: { score: number; checks: ChecklistCheck[]; note: string };
  description: { score: number; checks: ChecklistCheck[] };
}
export interface VideoDetailResponse extends Video {
  format: string;
  history: { day: string; views: number; likes: number; comments: number }[];
  metadataHistory: { id: number; observed_at: string; field: string; old_value: string | null; new_value: string | null }[];
}
export interface JobStatus {
  name: string;
  label: string;
  schedule: string;
  running: boolean;
  lastRun: string | null;
  lastOk: string | null;
  lastError: string | null;
  failuresInARow: number;
  due: string | null;
}
export interface HealthResponse {
  at: string;
  status: string;
  errors: number;
  warnings: number;
  items: { id: string; level: string; ok: boolean; title: string; detail: string; fix: string | null }[];
  jobs: JobStatus[];
}
export interface BackupsResponse {
  dir: string;
  backups: { file: string; day: string; bytes: number; at: string }[];
}
export interface BackupCreatedResponse {
  created: string;
  bytes: number;
  pruned: string[];
}

export interface ConfigUpdateResponse {
  changed: { key: string; value: string }[];
  yt_api_key?: string;
}
export type * from './research-index';
export type * from './ranks';
export type * from './trending';
export type * from './radar';

export type * from './round-three';
