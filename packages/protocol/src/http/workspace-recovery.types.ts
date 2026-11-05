/** Наблюдённая файловая идентичность; строки сохраняют точность исходных dev/ino. */
export type WorkspaceIdentity = { dev: string; ino: string };
/** Сохранённая привязка папки без операций с файловой системой. */
export type WorkspaceBinding = { id: string; canonicalPath: string; identity: WorkspaceIdentity };
/** Поддержанные имена платформ Node без зависимости контракта от Node global types. */
export type BindingRuntimePlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd';
/** Наблюдённая среда проверки папки, а не доказательство происхождения привязки. */
export type BindingRecoveryRuntime = {
  platform: BindingRuntimePlatform;
  node: string;
  uv: string;
  architecture: string;
};
/** Состояние проверки до принятия владельцем решения о восстановлении. */
export type BindingRecoveryStatus = 'healthy' | 'candidate' | 'conflict' | 'unavailable';
/** Сохранённое решение владельца, которое явно признаёт неизвестную непрерывность. */
export type WorkspaceBindingRecoveryAudit = {
  recoveryId: string;
  projectId: string;
  actorId: string;
  reason: string;
  acknowledgeUnknownContinuity: true;
  oldBinding: WorkspaceBinding;
  newBinding: WorkspaceBinding;
  runtime: BindingRecoveryRuntime;
  issuedAt: string;
  expiresAt: string;
  createdAt: string;
  origin: 'unknown';
};
/** Публичный HTTP-результат проверки без серверных probes и signing secret. */
export type WorkspaceBindingRecoveryInspection = {
  saved: WorkspaceBinding | null;
  observed?: WorkspaceBinding;
  eligible: boolean;
  reason: string;
  ticket?: string;
  expiresAt?: string;
  audit: WorkspaceBindingRecoveryAudit[];
  runtime: BindingRecoveryRuntime;
  status: BindingRecoveryStatus;
  origin: 'unknown';
};
