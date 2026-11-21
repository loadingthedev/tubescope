import type { Channel, Video } from './index';
export type TrendingVideo = Pick<
  Video,
  'id' | 'title' | 'channel_id' | 'channel_title' | 'published_at' | 'thumbnail' | 'view_count' | 'like_count' | 'comment_count' | 'category_id'
> & { duration?: string };
export type TrendingResponse = TrendingVideo[];
export type CategoriesResponse = { id: string; title: string }[];
export type NicheChannelsResponse = (Pick<Channel, 'id' | 'title' | 'handle' | 'thumbnail' | 'subscriber_count' | 'view_count' | 'video_count'> & {
  views_per_video: number;
  age_days: number;
})[];
export interface TitlePatternsResponse {
  sample: number;
  medianLength: number;
  medianWords: number;
  patterns: { pattern: string; count: number; share: number }[];
}
export type ResearchBoardsResponse = { id: number; name: string; items: number }[];
export interface BoardSaveResponse {
  id: number;
}
