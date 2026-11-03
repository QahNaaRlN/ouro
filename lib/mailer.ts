import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { OuroMailer } from './projects';

export function smtpConfigurationFromEnv(env:Record<string,string|undefined>):SMTPTransport.Options|undefined {
 const fields=['OURO_SMTP_HOST','OURO_SMTP_PORT','OURO_SMTP_SECURE','OURO_SMTP_USER','OURO_SMTP_PASSWORD'] as const;
 const separate=fields.some(key=>!!env[key]);
 if(!env.OURO_SMTP_URL&&!separate)return undefined;
 if(!env.OURO_MAIL_FROM||!env.OURO_MAIL_FROM.includes('@')||/[\r\n]/.test(env.OURO_MAIL_FROM))throw new Error('OURO_MAIL_FROM must contain a verified sender address');
 if(env.OURO_SMTP_URL&&separate)throw new Error('Configure either OURO_SMTP_URL or separate SMTP settings.');
 let host:string,port:string,secure:boolean,user:string,pass:string;
 if(env.OURO_SMTP_URL){
  let url:URL;try{url=new URL(env.OURO_SMTP_URL);}catch{throw new Error('Invalid SMTP URL.');}
  if(!['smtp:','smtps:'].includes(url.protocol)||url.pathname!=='/'&&url.pathname!==''||url.hash||[...url.searchParams.keys()].some(key=>key!=='secure')||url.searchParams.has('secure')&&!['true','false'].includes(url.searchParams.get('secure')!))throw new Error('SMTP URL must use smtp/smtps with verified TLS and supported parameters.');
  secure=url.protocol==='smtps:'||url.searchParams.get('secure')==='true';host=url.hostname;port=url.port||(secure?'465':'587');
  try{user=decodeURIComponent(url.username);pass=decodeURIComponent(url.password);}catch{throw new Error('Invalid SMTP credentials encoding.');}
  if(!!user!==!!pass)throw new Error('SMTP URL must provide both user and password.');
 }else{
  if(fields.some(key=>!env[key])||!['true','false'].includes(env.OURO_SMTP_SECURE!))throw new Error('Complete SMTP host, port, secure, user and password settings are required.');
  host=env.OURO_SMTP_HOST!;port=env.OURO_SMTP_PORT!;secure=env.OURO_SMTP_SECURE==='true';user=env.OURO_SMTP_USER!;pass=env.OURO_SMTP_PASSWORD!;
 }
 if(!host||/[\s/\\@]/.test(host)||!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('Invalid SMTP host or port.');
 return {host,port:Number(port),secure,requireTLS:!secure,tls:{rejectUnauthorized:true},...(user?{auth:{user,pass}}:{}),connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000};
}

export function createSmtpMailerFromEnv(env:Record<string,string|undefined> = process.env): OuroMailer | undefined {
  const options=smtpConfigurationFromEnv(env);if(!options)return undefined;
  const transport: Transporter = nodemailer.createTransport(options);
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
