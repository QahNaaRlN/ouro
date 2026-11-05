/** Выбирает port до env loading с разными launch/start authority. */
export function selectConsumerPort(
  mode: 'launch' | 'start',
  explicit: number | undefined,
  inherited: string | undefined,
): number;
/** Сохраняет старый start CLI parser; launch использует отдельный strict parser. */
export function parseStartPort(value: string): number;
/** Безопасный port admission failure. */
export class ConsumerPortError extends Error {
  readonly code: 'CONSUMER_PORT_INVALID' | 'CONSUMER_PORT_RESERVED';
  constructor(code?: 'CONSUMER_PORT_INVALID' | 'CONSUMER_PORT_RESERVED');
}
/** Проверяет только legacy browser-reserved ports перед bind. */
export function assertBrowserPort(port: number): void;
