import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfigResponse, ConfigUpdateResponse, SettingField } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError } from './components/research';

const hiddenGroups = new Set(['ai', 'voiceover', 'shorts', 'ideas', 'autopilot', 'social', 'bulk', 'production', 'phone', 'remote', 'make-video']);
const hiddenFields = new Set([
  'radar_ai_limit',
  'radar_calibrate_ai',
  'radar_hook_captions',
  'default_publish_hour',
  'ffmpeg_path',
  'ffprobe_path',
  'ideas_cron',
  'media_dirs',
  'allow_lan',
  'notify_imessage_to',
]);
const hiddenAlertKinds = new Set(['autopilot', 'ideas_daily']);
function visible(field: SettingField) {
  return !hiddenGroups.has(field.group) && !hiddenFields.has(field.key);
}
function validate(field: SettingField, value: string) {
  if (['int', 'number'].includes(field.type) && value !== '') {
    const number = Number(value);
    if (!Number.isFinite(number) || (field.type === 'int' && !Number.isInteger(number)))
      throw new Error(`${field.key}: enter ${field.type === 'int' ? 'a whole number' : 'a number'}.`);
    if (field.min !== undefined && number < field.min) throw new Error(`${field.key}: minimum ${field.min}.`);
    if (field.max !== undefined && number > field.max) throw new Error(`${field.key}: maximum ${field.max}.`);
  }
  if (field.pattern && value && !new RegExp(field.pattern).test(value)) throw new Error(`${field.key}: invalid format.`);
  if (field.type === 'timezone' && value) new Intl.DateTimeFormat('en', { timeZone: value }).format();
  if (field.type === 'url' && value && !/^https?:\/\/[^\s]+$/i.test(value)) throw new Error(`${field.key}: enter an http(s) URL.`);
  if (value.length > 4000) throw new Error(`${field.key}: maximum 4000 characters.`);
}
function Field({ field, value, change }: { field: SettingField; value: string; change: (value: string) => void }) {
  const options = field.values?.filter(value => field.key !== 'notify_kinds' || !hiddenAlertKinds.has(value));
  return (
    <label className="setting-field">
      <span>{field.key}</span>
      <small className="muted">{field.description}</small>
      {field.type === 'bool' ? (
        <select value={value} onChange={event => change(event.target.value)}>
          <option value="1">On</option>
          <option value="0">Off</option>
        </select>
      ) : field.type === 'enum' ? (
        <select value={value} onChange={event => change(event.target.value)}>
          {options?.map(option => (
            <option key={option} value={option}>
              {option || '(blank)'}
            </option>
          ))}
        </select>
      ) : field.type === 'list' ? (
        <select
          multiple
          value={value.split(',').filter(Boolean)}
          onChange={event => change(Array.from(event.target.selectedOptions, option => option.value).join(','))}
        >
          {options?.map(option => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'secret' ? 'password' : ['int', 'number'].includes(field.type) ? 'number' : 'text'}
          value={value}
          placeholder={field.type === 'secret' ? String(field.value) || 'Not set' : undefined}
          autoComplete={field.type === 'secret' ? 'new-password' : 'off'}
          min={field.min}
          max={field.max}
          step={field.type === 'int' ? 1 : 'any'}
          pattern={field.pattern}
          maxLength={4000}
          onChange={event => change(event.target.value)}
        />
      )}
      {field.type === 'secret' ? (
        <small className="muted">Stored value is masked. Only a changed value is sent. Clear the field after typing to remove the stored secret.</small>
      ) : null}
      {field.type === 'cron' ? <small className="muted">Cron expressions are validated by the server before any changes are saved.</small> : null}
    </label>
  );
}
export function Settings() {
  const config = useQuery({ queryKey: ['config'], queryFn: ({ signal }) => getJson<ConfigResponse>('/config', signal) });
  const client = useQueryClient();
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const fields = config.data?.settings.filter(visible) || [];
      for (const field of fields) if (field.key in changes) validate(field, changes[field.key].trim());
      return await mutateJson<ConfigUpdateResponse>('/config', 'PUT', changes);
    },
    onSuccess: async result => {
      setChanges({});
      setMessage(`Settings saved.${result.yt_api_key ? ` YouTube API key: ${result.yt_api_key}` : ''}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['config'] }),
        client.invalidateQueries({ queryKey: ['settings'] }),
        client.invalidateQueries({ queryKey: ['quota'] }),
      ]);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    save.mutate();
  }
  return (
    <div className="settings-page">
      <PageHeader title="Settings" description="Read-only YouTube research. Configure data access, research, notifications and your weekly Notion report." />
      {config.isError ? (
        <QueryError error={config.error} retry={() => void config.refetch()} />
      ) : config.isPending ? (
        <p role="status">Loading settings…</p>
      ) : (
        <form onSubmit={submit}>
          {config.data.groups.map(group => {
            const fields = config.data.settings.filter(field => field.group === group && visible(field));
            return fields.length ? (
              <fieldset key={group} className="dashboard-card" disabled={save.isPending}>
                <legend>{group === 'publishing' ? 'Time zone' : group}</legend>
                <div className="settings-fields">
                  {fields.map(field => (
                    <Field
                      key={field.key}
                      field={field}
                      value={changes[field.key] ?? (field.type === 'secret' ? '' : String(field.value))}
                      change={value => {
                        setMessage('');
                        setChanges(previous => ({ ...previous, [field.key]: value }));
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            ) : null;
          })}
          {!config.data.settings.some(visible) ? (
            <p>No settings available.</p>
          ) : (
            <button className="primary-button" disabled={save.isPending || !Object.keys(changes).length}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </form>
      )}
      {message ? <p role="status">{message}</p> : null}
      {save.isError ? (
        <p role="alert" className="error-message">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
