import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useId, useState, type FormEvent } from 'react';
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
function SettingControl({ field, value, change, invalid }: { field: SettingField; value: string; change: (value: string) => void; invalid: boolean }) {
  const id = useId();
  const options = field.values?.filter(value => field.key !== 'notify_kinds' || !hiddenAlertKinds.has(value));
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{field.key}</FieldLabel>
      <FieldDescription id={`${id}-description`}>{field.description}</FieldDescription>
      {field.type === 'bool' ? (
        <Switch id={id} aria-describedby={`${id}-description`} checked={value === '1'} onCheckedChange={checked => change(checked ? '1' : '0')} />
      ) : field.type === 'enum' && options && options.length >= 2 && options.length <= 5 ? (
        <ToggleGroup
          id={id}
          aria-label={field.key}
          aria-describedby={`${id}-description`}
          aria-invalid={invalid}
          type="single"
          variant="outline"
          value={value || '__blank__'}
          onValueChange={value => {
            if (value) change(value === '__blank__' ? '' : value);
          }}
        >
          {options.map(option => (
            <ToggleGroupItem key={option} value={option || '__blank__'}>
              {option || '(blank)'}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : field.type === 'enum' ? (
        <Select value={value || '__blank__'} onValueChange={value => change(value === '__blank__' ? '' : value)}>
          <SelectTrigger aria-invalid={invalid} id={id} aria-describedby={`${id}-description`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options?.map(option => (
                <SelectItem key={option} value={option || '__blank__'}>
                  {option || '(blank)'}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : field.type === 'list' ? (
        <FieldSet aria-describedby={`${id}-description`}>
          <FieldLegend className="sr-only">{field.key}</FieldLegend>
          <FieldGroup>
            {options?.map((option, index) => (
              <Field key={option} orientation="horizontal">
                <Checkbox
                  id={`${id}-${index}`}
                  checked={value.split(',').filter(Boolean).includes(option)}
                  onCheckedChange={checked => {
                    const selected = new Set(value.split(',').filter(Boolean));
                    if (checked) selected.add(option);
                    else selected.delete(option);
                    change(options.filter(option => selected.has(option)).join(','));
                  }}
                />
                <FieldLabel htmlFor={`${id}-${index}`}>{option}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      ) : (
        <Input
          aria-invalid={invalid}
          id={id}
          aria-describedby={`${id}-description`}
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
        <FieldDescription>Stored value is masked. Only a changed value is sent. Clear the field after typing to remove the stored secret.</FieldDescription>
      ) : null}
      {field.type === 'cron' ? <FieldDescription>Cron expressions are validated by the server before any changes are saved.</FieldDescription> : null}
    </Field>
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
    <>
      <PageHeader title="Settings" description="Read-only YouTube research. Configure data access, research, notifications and your weekly Notion report." />
      {config.isError ? (
        <QueryError error={config.error} retry={() => void config.refetch()} />
      ) : config.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Loading settings…</span>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {config.data.groups.map(group => {
            const fields = config.data.settings.filter(field => field.group === group && visible(field));
            return fields.length ? (
              <Card key={group}>
                <CardHeader>
                  <CardTitle>{group === 'publishing' ? 'Time zone' : group}</CardTitle>
                </CardHeader>
                <CardContent>
                  <fieldset disabled={save.isPending}>
                    <legend className="sr-only">{group === 'publishing' ? 'Time zone' : group}</legend>
                    <FieldGroup>
                      {fields.map(field => (
                        <SettingControl
                          key={field.key}
                          field={field}
                          invalid={save.isError && save.error.message.startsWith(`${field.key}:`)}
                          value={changes[field.key] ?? (field.type === 'secret' ? '' : String(field.value))}
                          change={value => {
                            setMessage('');
                            setChanges(previous => ({ ...previous, [field.key]: value }));
                          }}
                        />
                      ))}
                    </FieldGroup>
                  </fieldset>
                </CardContent>
              </Card>
            ) : null;
          })}
          {!config.data.settings.some(visible) ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No settings available.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Button disabled={save.isPending || !Object.keys(changes).length}>
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </form>
      )}
      {message ? <p role="status">{message}</p> : null}
      {save.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
