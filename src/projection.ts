import { CONTENT_NOTICE, type ToolName } from './tools.js';

type Data = Record<string, unknown>;
const object = (value: unknown): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid remote result');
  return value as Data;
};
const text = (value: unknown, limit = 8000): string => typeof value === 'string' ? value.slice(0, limit) : '';
const count = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('Invalid remote count');
  return Number(value);
};
function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    url.search = ''; url.hash = '';
    return url.toString();
  } catch { return ''; }
}
function contentSummary(value: unknown, kind: 'link' | 'board'): Data {
  const row = object(value);
  return kind === 'link'
    ? { id: text(row.id, 36), shortCode: text(row.shortCode, 50), description: text(row.description, 8000), destination: safeUrl(row.destination), public: row.public === true, createdAt: text(row.createdAt, 50) }
    : { id: text(row.id, 36), title: text(row.title, 255), published: row.published === true, visibility: text(row.visibility, 30), pageCount: count(row.pageCount), createdAt: text(row.createdAt, 50) };
}

// A second allowlist prevents accidental upstream additions (raw events, identities,
// credentials or operational fields) from becoming part of the public bridge contract.
export function projectResult(name: ToolName, value: unknown): Data {
  const data = object(value);
  if (name === 'list_links' || name === 'list_boards') {
    if (!Array.isArray(data.items) || data.items.length > 100) throw new Error('Invalid remote page');
    return { items: data.items.map(item => contentSummary(item, name === 'list_links' ? 'link' : 'board')),
      page: count(data.page), pageSize: count(data.pageSize), totalElements: count(data.totalElements), totalPages: count(data.totalPages), hasNext: data.hasNext === true, contentSafety: CONTENT_NOTICE };
  }
  if (name === 'get_owned_content') {
    if (data.kind === 'link') return { kind: 'link', id: text(data.id, 36), shortCode: text(data.shortCode, 50), description: text(data.description), destination: safeUrl(data.destination), contentSafety: CONTENT_NOTICE };
    if (data.kind !== 'board' || !Array.isArray(data.text) || data.text.length > 500) throw new Error('Invalid remote content');
    let remaining = 32_000;
    const lines = data.text.map(line => { const output = text(line, Math.max(0, Math.min(4000, remaining))); remaining -= output.length; return output; }).filter(Boolean);
    return { kind: 'board', id: text(data.id, 36), title: text(data.title, 255), pageTitle: text(data.pageTitle, 255), page: count(data.page), pageCount: count(data.pageCount), text: lines, truncated: data.truncated === true || remaining <= 0, contentSafety: CONTENT_NOTICE };
  }
  if (name === 'get_workspace_summary') return { activeLinks: count(data.activeLinks), activeBoards: count(data.activeBoards), scope: 'owner_only' };
  if (name === 'get_platform_stats') {
    const bucket = (value: unknown) => {
      if (value === '<100') return value;
      if (typeof value !== 'string' || !/^[1-9]\d{2,14}\+$/.test(value) || Number(value.slice(0, -1)) % 100 !== 0) throw new Error('Invalid public total');
      return value;
    };
    return { publicLinks: bucket(data.publicLinks), publicDiscoverableBoards: bucket(data.publicDiscoverableBoards), scope: 'public_catalog_only', precision: 'rounded_down_to_100' };
  }
  const classes = new Set(['human', 'likely_human', 'probable_human', 'qualified_human', 'preview', 'preview_fetch', 'bot', 'verified_bot', 'automated', 'suspicious', 'raw_hit', 'unclassified']);
  const categories = Object.fromEntries(Object.entries(object(data.trafficCategories)).filter(([key]) => classes.has(key)).map(([key, value]) => [key, count(value)]));
  const dailyEntries = Object.entries(object(data.dailyRequests));
  if (dailyEntries.length > 31 || dailyEntries.some(([key]) => !/^\d{4}-\d{2}-\d{2}$/.test(key))) throw new Error('Invalid analytics window');
  const total = count(data.recordedRequests);
  if (Object.values(categories).reduce((sum, value) => sum + value, 0) !== total
    || dailyEntries.reduce((sum, [, value]) => sum + count(value), 0) !== total) throw new Error('Inconsistent analytics totals');
  return { id: text(data.id, 36), windowStart: text(data.windowStart, 50), windowEnd: text(data.windowEnd, 50), recordedRequests: count(data.recordedRequests), trafficCategories: categories,
    dailyRequests: Object.fromEntries(dailyEntries.map(([key, value]) => [key, count(value)])), measurement: 'Recorded requests are not unique people or verified conversions.', scope: 'owner_only_aggregate' };
}
