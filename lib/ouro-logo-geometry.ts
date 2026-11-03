/** Geometry of the accepted closed S-trajectory. The route itself never rotates. */
export const OURO_LOGO_PERIOD_SECONDS=7.2;
type Point={x:number;y:number};
type Route={points:Point[];lengths:number[];total:number};
let cachedRoute:Route|undefined;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>n*n*(3-2*n);
const point=(p:Point)=>p.x.toFixed(3)+' '+p.y.toFixed(3);

export function ouroLogoTrajectory():Readonly<{points:readonly Readonly<Point>[];lengths:readonly number[];total:number}>{
  if(cachedRoute)return cachedRoute;
  const points:Point[]=[],lengths=[0],samples=2048;
  let total=0;
  for(let i=0;i<=samples;i++){
    const angle=Math.PI*2*i/samples;
    const radius=42+1.1*Math.sin(7*angle)+.12*Math.sin(2*angle+.7);
    const p={x:64+radius*Math.cos(angle),y:64+radius*Math.sin(angle)};
    if(i)total+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);
    points.push(p);if(i)lengths.push(total);
  }
  cachedRoute={points,lengths,total};
  return cachedRoute;
}

/** Binary search advances every body sample by equal distance along one fixed route. */
export function ouroLogoAlong(distance:number){
  const route=ouroLogoTrajectory(),d=((distance%route.total)+route.total)%route.total;
  let low=0,high=route.lengths.length-1;
  while(high-low>1){const middle=(low+high)>>1;if(route.lengths[middle]<=d)low=middle;else high=middle;}
  const fraction=(d-route.lengths[low])/(route.lengths[high]-route.lengths[low]);
  const a=route.points[low],b=route.points[high],length=Math.hypot(b.x-a.x,b.y-a.y);
  return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,tx:(b.x-a.x)/length,ty:(b.y-a.y)/length};
}

export function ouroLogoShape(timeSeconds:number){
  const route=ouroLogoTrajectory();
  const time=Number.isFinite(timeSeconds)?((timeSeconds%OURO_LOGO_PERIOD_SECONDS)+OURO_LOGO_PERIOD_SECONDS)%OURO_LOGO_PERIOD_SECONDS:0;
  const headDistance=route.total*(.91+time/OURO_LOGO_PERIOD_SECONDS),bodyLength=route.total*.93;
  const left:Point[]=[],right:Point[]=[],samples=180;
  for(let i=0;i<=samples;i++){
    const s=i/samples,p=ouroLogoAlong(headDistance-(1-s)*bodyLength);
    const width=(.18+3.85*smooth(clamp(s/.34,0,1)))*(1-.23*Math.pow(s,7));
    left.push({x:p.x-p.ty*width,y:p.y+p.tx*width});
    right.push({x:p.x+p.ty*width,y:p.y-p.tx*width});
  }
  const body='M'+left.map(point).join('L')+'L'+right.reverse().map(point).join('L')+'Z';
  const neck=ouroLogoAlong(headDistance);
  const local=(x:number,y:number)=>point({x:neck.x+neck.tx*x-neck.ty*y,y:neck.y+neck.ty*x+neck.tx*y});
  const head='M'+local(-3.8,-2.9)+'L'+local(-.8,-5.5)+'L'+local(2.7,-5.6)+'L'+local(9.9,-2.2)+'Q'+local(12.2,-1)+' '+local(11.9,.8)+'L'+local(9.6,2.5)+'L'+local(3.3,5.1)+'L'+local(-3.9,3.15)+'Q'+local(-2.8,.2)+' '+local(-3.8,-2.9)+'Z';
  const eye='M'+local(2.2,-3.3)+'L'+local(5.8,-2.3)+'Q'+local(4.4,-1.45)+' '+local(2.7,-2.25)+'Z'+'M'+local(7.2,1.1)+'L'+local(11.2,.3)+'L'+local(9.8,1.15)+'L'+local(7.1,1.45)+'Z';
  return {body,head,eye,headPoint:{x:neck.x,y:neck.y}};
}
