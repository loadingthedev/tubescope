export interface RadarWatchVideo {
  video_id: string;
  title: string | null;
  thumbnail: string | null;
  channel_title: string | null;
  kind: string;
  active: boolean;
  age_hours: number | null;
  views: number | null;
  expected: number | null;
  idx: number | null;
  peak_idx: number | null;
  status: string | null;
  confidence: string | null;
  baseline_source: string | null;
  ctr: number | null;
  ctr_vs_channel: number | null;
  retention_pct: number | null;
  retention_vs_channel: number | null;
}
export interface RadarWatchResponse {
  lastRun: { at: string; watched: number; channels: number; errors: string[] } | null;
  videos: RadarWatchVideo[];
}
export interface RadarCurveResponse {
  video: RadarWatchVideo;
  ticks: { ts: string; age_hours: number; views: number | null }[];
  expected: { h: number; v: number | null }[];
}
export interface RadarAlert {
  id: number;
  kind: string;
  created_at: string;
  payload: { videoId?: string; channelId?: string; x?: number; ageHours?: number };
}
export type RadarAlertsResponse = RadarAlert[];
export interface RadarHoldout {
  available: boolean;
  reason?: string;
  train?: number;
  test?: number;
  spearman?: number | null;
  topQuartileHitRate?: number;
  baseHitRate?: number;
  lift?: number | null;
  topVsBottomMedianX?: number;
  breakoutsInTopHalf?: number;
  breakoutsInTest?: number;
  maeLog2?: number;
  maeNaiveLog2?: number;
  verdict?: string;
}
export interface RadarMetrics {
  holdout: RadarHoldout;
  sample: { labelled: number; own: number; competitors: number };
  noSignal?: boolean;
}
export interface RadarModelSummary {
  id: number | null;
  createdAt: string | null;
  nTrain: number;
  metrics: RadarMetrics | null;
}
export interface RadarModelResponse {
  current: RadarModelSummary & { calibrated: boolean; weights: Record<string, number>; axes: Record<string, { rho: number | null; n: number }> | null };
  history: RadarModelSummary[];
}
export interface RadarJobResponse {
  id: string;
  channelId: string;
  status: string;
  error: string | null;
  progress: { stage?: string; done?: number; total?: number };
}
