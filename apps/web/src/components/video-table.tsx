import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from 'lucide-react';
import type { Video } from '@tubescope/shared';
import { SaveToBoard } from './save-to-board';
import { Table } from './research';
import { OutlierMark } from './outlier-mark';
import { ageDays, format, times } from './format';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export type ResultVideo = Video & {
  channel_subs?: number | null;
  vpd?: number;
  subs_ratio?: number | null;
  outlierX?: number | null;
  outlier_x?: number;
  baselineSample?: number;
  sample?: number;
  channelMedianViews?: number | null;
  velocity_x?: number;
};
const columns = ['Video', 'Channel', 'Views', 'Views/day', 'Subs', 'Views÷subs', 'Outlier × vs channel normal', 'Published age', 'Format'] as const;
type Column = (typeof columns)[number];
function value(video: ResultVideo, column: Column): string | number | null {
  switch (column) {
    case 'Video':
      return video.title;
    case 'Channel':
      return video.channel_title;
    case 'Views':
      return video.view_count;
    case 'Views/day':
      return video.vpd ?? video.view_count / ageDays(video.published_at);
    case 'Subs':
      return video.channel_subs ?? null;
    case 'Views÷subs':
      return video.subs_ratio ?? (video.channel_subs ? video.view_count / video.channel_subs : null);
    case 'Outlier × vs channel normal':
      return video.outlierX ?? video.outlier_x ?? null;
    case 'Published age':
      return ageDays(video.published_at);
    case 'Format':
      return video.is_short ? 'Shorts' : 'Long-form';
  }
}
export function VideoTable({ rows }: { rows: ResultVideo[] }) {
  const [sort, setSort] = useState<{ column: Column; ascending: boolean } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const left = value(a, sort.column),
          right = value(b, sort.column);
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return (typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right)) * (sort.ascending ? 1 : -1);
      })
    : rows;
  if (!rows.length)
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>No videos match</EmptyTitle>
          <EmptyDescription>Loosen the filters, or sync more channel videos in the classic UI.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table caption="Video results. Use column buttons to sort.">
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column} scope="col" aria-sort={sort?.column === column ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
              <button
                type="button"
                className="group inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                onClick={() => setSort({ column, ascending: sort?.column === column ? !sort.ascending : false })}
              >
                {column}
                {sort?.column === column ? (
                  sort.ascending ? (
                    <ArrowUp aria-hidden="true" className="size-3" />
                  ) : (
                    <ArrowDown aria-hidden="true" className="size-3" />
                  )
                ) : (
                  <ArrowUpDown aria-hidden="true" className="size-3 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" />
                )}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(video => {
          const outlier = value(video, 'Outlier × vs channel normal') as number | null;
          return (
            <tr key={`${video.channel_id}:${video.id}`}>
              <td className="min-w-72 max-w-[26rem]">
                <div className="flex items-start gap-3">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt=""
                      width="96"
                      height="54"
                      loading="lazy"
                      className="aspect-video w-24 shrink-0 rounded-md object-cover ring-1 ring-border"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <a
                      className="line-clamp-2 leading-snug font-medium"
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {video.title}
                    </a>
                    <SaveToBoard video={video} />
                  </div>
                </div>
              </td>
              <td className="text-muted-foreground">{video.channel_title}</td>
              <td>{format(video.view_count)}</td>
              <td>{format(Math.round(value(video, 'Views/day') as number))}</td>
              <td>{format(video.channel_subs)}</td>
              <td>{times(value(video, 'Views÷subs') as number | null)}</td>
              <td>
                <OutlierMark value={outlier} />
                {video.baselineSample !== undefined || video.sample !== undefined ? (
                  <small className="block text-xs text-muted-foreground">Sample: {video.baselineSample ?? video.sample}</small>
                ) : null}
                {video.velocity_x !== undefined ? <small className="block text-xs text-muted-foreground">Velocity: {times(video.velocity_x)}</small> : null}
              </td>
              <td>{format(Math.floor(ageDays(video.published_at)))}d ago</td>
              <td>
                <Badge variant={video.is_short ? 'secondary' : 'outline'}>{video.is_short ? 'Shorts' : 'Long-form'}</Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
