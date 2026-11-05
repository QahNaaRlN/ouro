/** Роль действующего участника проекта; сама DTO не предоставляет полномочий. */
export type ProjectRole = 'Owner' | 'Contributor' | 'Viewer';
/** Метаданные проекта, доступного текущему пользователю через HTTP. */
export type ProjectMetadata = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  createdBy: string | null;
  role: ProjectRole;
};
/** Представление членства без credential, password и серверных SQL-полей. */
export type ProjectMembership = {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name: string;
  role: ProjectRole;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
};
/** Представление приглашения без одноразового кода принятия. */
export type ProjectInvitation = {
  id: string;
  projectId: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
/** Публичная регистрация участника без выдаваемого ему credential. */
export type ParticipantRegistration = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
};
