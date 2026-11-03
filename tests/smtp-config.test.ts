import test from 'node:test';
import assert from 'node:assert/strict';
import {smtpConfigurationFromEnv,createSmtpMailerFromEnv} from '../lib/mailer';
const from={OURO_MAIL_FROM:'Ouro <sender@example.invalid>'};
const complete={...from,OURO_SMTP_HOST:'smtp.example.invalid',OURO_SMTP_PORT:'587',OURO_SMTP_SECURE:'false',OURO_SMTP_USER:'sender',OURO_SMTP_PASSWORD:'test-secret'};
test('SMTP configuration preserves TLS verification for submission, implicit TLS and URL compatibility',()=>{
 assert.equal(createSmtpMailerFromEnv({}),undefined);
 const starttls=smtpConfigurationFromEnv(complete)!;assert.equal(starttls.requireTLS,true);assert.equal(starttls.secure,false);assert.deepEqual(starttls.tls,{rejectUnauthorized:true});
 const implicit=smtpConfigurationFromEnv({...complete,OURO_SMTP_PORT:'465',OURO_SMTP_SECURE:'true'})!;assert.equal(implicit.secure,true);assert.deepEqual(implicit.auth,{user:'sender',pass:'test-secret'});
 const url=smtpConfigurationFromEnv({...from,OURO_SMTP_URL:'smtps://sender:p%40ss@smtp.example.invalid:465'})!;assert.equal(url.secure,true);assert.deepEqual(url.auth,{user:'sender',pass:'p@ss'});
});
test('partial, ambiguous, malformed and TLS-downgrade SMTP configuration fails without disclosing secrets',()=>{
 for(const env of [{OURO_SMTP_HOST:'host'}, {...complete,OURO_SMTP_PASSWORD:''},{...complete,OURO_SMTP_PORT:'0'},{...complete,OURO_SMTP_SECURE:'yes'},{...complete,OURO_SMTP_URL:'smtp://sender:test-secret@host'},{...from,OURO_SMTP_URL:'smtp://sender:test-secret@host?ignoreTLS=true'},{...from,OURO_SMTP_URL:'smtp://sender:test-secret@host?tls.rejectUnauthorized=false'},{...from,OURO_SMTP_URL:'https://sender:test-secret@host'},{...complete,OURO_MAIL_FROM:'sender@example.invalid\r\nBcc: other@example.invalid'}]){
  assert.throws(()=>smtpConfigurationFromEnv(env),error=>error instanceof Error&&!error.message.includes('test-secret'));
 }
});
