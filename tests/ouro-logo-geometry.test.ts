import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ouroLogoAlong,ouroLogoShape,ouroLogoTrajectory,OURO_LOGO_PERIOD_SECONDS} from '../lib/ouro-logo-geometry';

test('rest pose retains all three paths of the accepted Ouro S-trajectory asset',()=>{
  const {body,head,eye}=ouroLogoShape(0);
  // SHA of the three approved ouro-serpentine-path.svg path strings, in source order.
  assert.equal(createHash('sha256').update([body,head,eye].join('\n')).digest('hex'),'fb84be2b7d7056a28b2be75bed247c79bc580ffd31fd7e5c12f1ef7ed92958bc');
  assert.deepEqual(ouroLogoShape(OURO_LOGO_PERIOD_SECONDS),ouroLogoShape(0));
});

test('the stationary closed route keeps fourteen S inflections and advances at equal arc-length speed',()=>{
  const route=ouroLogoTrajectory(),points=route.points.slice(0,-1);
  assert.equal(points.length,2048);
  assert(Math.hypot(points[0].x-route.points.at(-1)!.x,points[0].y-route.points.at(-1)!.y)<1e-9);
  const signs=points.map((b,i)=>{const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];const dx=(c.x-a.x)/2,dy=(c.y-a.y)/2;return Math.sign(dx*(c.y-2*b.y+a.y)-dy*(c.x-2*b.x+a.x));});
  assert.equal(signs.filter((sign,i)=>sign!==signs[(i+signs.length-1)%signs.length]).length,14);
  assert(Math.max(...points.map(p=>Math.abs(Math.hypot(p.x-64,p.y-64)-42)))<1.3);
  const distances=Array.from({length:1024},(_,i)=>{const a=ouroLogoAlong(route.total*i/1024),b=ouroLogoAlong(route.total*(i+1)/1024);return Math.hypot(b.x-a.x,b.y-a.y);});
  assert(Math.max(...distances)/Math.min(...distances)<1.005);
  assert.equal(ouroLogoTrajectory(),route,'animated phases reuse one stationary trajectory');
});
