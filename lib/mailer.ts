import nodemailer, { type Transporter } from 'nodemailer';
import type { OuroMailer } from './projects';

export function createSmtpMailerFromEnv(env: NodeJS.ProcessEnv = process.env): OuroMailer | undefined {
  if (!env.OURO_SMTP_URL) return undefined;
  if (!env.OURO_MAIL_FROM || !env.OURO_MAIL_FROM.includes('@')) throw new Error('OURO_MAIL_FROM must contain a verified sender address');
  const transport: Transporter = nodemailer.createTransport(env.OURO_SMTP_URL);
  const from = env.OURO_MAIL_FROM;
  const send = async (to: string, subject: string, text: string) => {
    await transport.sendMail({ from, to, subject, text });
  };
  return {
    sendInvitation: input => send(input.email, `Приглашение в ${input.projectName} · Ouro`, [
      `Вас пригласили в проект «${input.projectName}» с ролью ${input.role}.`,
      '',
      'Откройте Ouro, выберите «Принять приглашение» и введите одноразовый код:',
      input.code,
      '',
      `Код действует до ${input.expiresAt}. Если вы не ожидали приглашения, проигнорируйте письмо.`,
    ].join('\n')),
    sendPasswordReset: input => send(input.email, 'Код сброса пароля · Ouro', [
      `Здравствуйте, ${input.name}.`,
      '',
      'Для сброса пароля введите в Ouro одноразовый код:',
      input.code,
      '',
      `Код действует до ${input.expiresAt}. Если вы не запрашивали сброс, проигнорируйте письмо.`,
    ].join('\n')),
  };
}
