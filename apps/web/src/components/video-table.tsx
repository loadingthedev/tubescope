import { SaveToBoard } from './save-to-board';
import { useState } from 'react';
import type { Video } from '@tubescope/shared';
import { Table } from './research';
import { ageDays, format, times } from './format';

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
      <div className="empty-state">
        <h2>No results</h2>
        <p>Adjust the filters or sync more channel videos in the classic UI.</p>
      </div>
    );
  return (
    <Table caption="Video results. Use column buttons to sort.">
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column} scope="col" aria-sort={sort?.column === column ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
              <button className="sort-button" type="button" onClick={() => setSort({ column, ascending: sort?.column === column ? !sort.ascending : false })}>
                {column}
                {sort?.column === column ? (sort.ascending ? ' ↑' : ' ↓') : ''}
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
              <td>
                <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noreferrer">
                  {video.thumbnail ? <img src={video.thumbnail} alt="" width="96" height="54" loading="lazy" /> : null}
                  <span>{video.title}</span>
                </a>
                <SaveToBoard video={video} />
              </td>
              <td>{video.channel_title}</td>
              <td>{format(video.view_count)}</td>
              <td>{format(Math.round(value(video, 'Views/day') as number))}</td>
              <td>{format(video.channel_subs)}</td>
              <td>{times(value(video, 'Views÷subs') as number | null)}</td>
              <td>
                <span className={outlier !== null && outlier >= 3 ? 'badge accent' : ''}>{times(outlier)}</span>
                {video.baselineSample !== undefined || video.sample !== undefined ? (
                  <small className="sample-note">Sample: {video.baselineSample ?? video.sample}</small>
                ) : null}
                {video.velocity_x !== undefined ? <small className="sample-note">Velocity: {times(video.velocity_x)}</small> : null}
              </td>
              <td>{format(Math.floor(ageDays(video.published_at)))}d ago</td>
              <td>
                <span className="badge">{video.is_short ? 'Shorts' : 'Long-form'}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
