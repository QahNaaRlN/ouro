# ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ
## Ouro OS — Реализация Control Plane
**Версия:** 1.0 Ouro | **Пакеты:** @ouro/core, @ouro/mcp, @ouro/view

### 1. Архитектура Ouro
- **Frontend:** Next.js 14 (App Router) + React Flow + Tailwind + Framer Motion
- **Realtime:** PartyKit / Supabase Realtime, канал `ouro:spec:{id}:events`, WebSocket + SSE fallback
- **Backend:** tRPC + Node.js + Redis Pub/Sub
- **MCP:** ouro-mcp сервер TS, 4 тула с Zod валидацией (reason >=50 chars, options.length >=2)
- **DB:** Postgres, Event Sourcing, только INSERT

### 2. SQL Схема Ouro
```sql
CREATE TABLE ouro_specs (
  id TEXT PRIMARY KEY, -- OURO-S-XXX
  title TEXT,
  status TEXT CHECK(status IN ('idea','speced','in_progress','blocked','done','invalidated')),
  goal TEXT,
  dod TEXT[],
  constraints TEXT[],
  assumptions TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ouro_reality_events (
  id UUID PRIMARY KEY,
  spec_id TEXT REFERENCES ouro_specs(id),
  type TEXT CHECK(type IN ('action','question','fork','blocker','success','fail')),
  payload JSONB,
  status TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  reason TEXT NOT NULL,
  created_by_agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON ouro_reality_events(spec_id, created_at);
CREATE TABLE ouro_agents (id TEXT PRIMARY KEY, name TEXT, last_seen TIMESTAMPTZ);
```

### 3. API Контракты Ouro (tRPC)
- `ouro.reportEvent: (specId, type, payload) => {eventId, status: pending}` — вызывает агент
- `ouro.approveEvent: (eventId, decision: {chosenOptionId, comment}) => {newSpecId?}` — вызывает человек
- `ouro.subscribeToSpec: (specId) => EventStream<ouro_reality_events>` — WS подписка
- `ouro.getRoadmap: () => {specs[], edges[]}`
- `ouro.getSpecDetail: (specId) => {spec, timeline}`

### 4. Компоненты Ouro View (React)
- `OuroSpecNode: {id, title, status, progress}` — pulse если in_progress/blocked
- `OuroRealtimeEdge: {from, to, isActive}` — SVG path, class edge-ouro-realtime
- `OuroRealityNodeCard: {type, reason, time, status}` — для fork кнопки Approve A/B
- `OuroSplitView: Left Spec Form (read-only), Right Timeline (virtualized)`
- `OuroMetricsCard: {label, value, miniChart}`
- `OuroLiveToast: bottom stack`

### 5. Логика мерцания Ouro
```css
@keyframes dash-move { to { stroke-dashoffset: -16; } }
@keyframes pulse-glow { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } 50% { box-shadow: 0 0 0 8px rgba(245,158,11,0.3); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
.edge-ouro-realtime { stroke-dasharray: 8 8; animation: dash-move 1.2s linear infinite; filter: drop-shadow(0 0 6px currentColor); transition: filter 0.2s; }
.edge-ouro-realtime.active { filter: drop-shadow(0 0 12px currentColor); }
```
JS: при WS событии на specId найти edge и добавить .active на 2с.

### 6. Безопасность и Анти-спам агента
- Rate limit: max 10 pending per spec per agent
- Deduplication: hash(reason)
- Валидация reason через LLM-judge: должен содержать expected vs actual
- Human-in-the-loop обязателен для fork/blocker, Action/Question может авто-аппрувиться при confidence >0.9

### 7. Этапы внедрения Ouro
- **MVP (1 неделя):** дашборд + Postgres + симуляция агента + сохранение в deployment DB
- **v0.2:** PartyKit Realtime + ouro-mcp + подключение Cursor/Claude Code
- **v1.0:** Метрика дрейфа, Архив уроков, GitHub интеграция (коммит = auto Action)
- **v2.0:** Yjs коллаборация, AI-саммаризация Reality -> новая Spec

### 8. Бренд Ouro
- Лого: две стрелки в круге, Ожидание и Реальность, янтарный акцент #F59E0B (яркая версия #FFB020)
- Шрифт: Inter, JetBrains Mono для кода
- Иконка: круглая, работает как favicon 16x16
