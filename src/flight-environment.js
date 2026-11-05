// Seeded weather and sensor errors. Everything is plain data so a flight can be
// replayed from its preset and seed. All numbers are training assumptions, not
// measurements of a site or a certified aircraft.
const degree=Math.PI/180;
export const windReferenceHeight=3.5;
export const windSpeedCap=4.9; // The practical test is not flown at 5 m/s or above.
export const windPresets=Object.freeze({
  calm:Object.freeze({label:'無風',meanSpeed:0}),
  light:Object.freeze({label:'微風',meanSpeed:1.5}),
  moderate:Object.freeze({label:'やや強い風',meanSpeed:3}),
  limit:Object.freeze({label:'上限付近',meanSpeed:4}),
});
const bearingLabels=['前方','右前','右','右後ろ','後ろ','左後ろ','左','左前'];
// 0 degrees is the direction the pilot faces; bearings increase toward the pilot's right.
export function windBearingLabel(fromDeg) {
  return bearingLabels[Math.round(((fromDeg%360)+360)%360/45)%8];
}
function nextUniform(env) {
  env.rng=(env.rng+0x6D2B79F5)|0;
  let t=Math.imul(env.rng^(env.rng>>>15),1|env.rng);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;
}
function nextNormal(env) {
  const u=Math.max(nextUniform(env),1e-12);
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*nextUniform(env));
}
// Ornstein-Uhlenbeck: a value that wanders around zero with memory `tau`.
function wander(env,value,sigma,tau,dt) {
  return value-value*dt/tau+sigma*Math.sqrt(2*dt/tau)*nextNormal(env);
}
export function createEnvironment({preset='calm',seed=1,windFromDeg=null}={}) {
  if(!windPresets[preset])throw new Error(`Unknown wind preset: ${preset}`);
  const env={preset,seed:seed|0,rng:seed|0,time:0,windFromDeg:0,direction:0,
    slowX:0,slowZ:0,fastX:0,fastZ:0,gust:null,nextGustAt:0,
    gnssX:0,gnssZ:0,baro:0,turbulenceRoll:0,turbulencePitch:0,
    imuBias:{roll:0,pitch:0},wind:{x:0,z:0,speed:0}};
  // Always draw, so a logged bearing replays the same flight as the seed alone.
  const drawnBearing=Math.floor(nextUniform(env)*360);
  env.windFromDeg=windFromDeg??drawnBearing;
  env.imuBias.roll=nextNormal(env)*.45*degree;
  env.imuBias.pitch=nextNormal(env)*.45*degree;
  env.nextGustAt=8+nextUniform(env)*20;
  return env;
}
export function stepEnvironment(env,dt,height=0) {
  env.time+=dt;
  const mean=windPresets[env.preset].meanSpeed;
  env.gnssX=wander(env,env.gnssX,.2,28,dt);
  env.gnssZ=wander(env,env.gnssZ,.2,28,dt);
  env.baro=wander(env,env.baro,.05,18,dt);
  env.turbulenceRoll=wander(env,env.turbulenceRoll,1,.28,dt);
  env.turbulencePitch=wander(env,env.turbulencePitch,1,.28,dt);
  if(mean<=0){env.wind={x:0,z:0,speed:0};return env.wind;}
  env.direction=wander(env,env.direction,12*degree,40,dt);
  env.slowX=wander(env,env.slowX,mean*.16,5,dt);
  env.slowZ=wander(env,env.slowZ,mean*.16,5,dt);
  env.fastX=wander(env,env.fastX,mean*.07,.7,dt);
  env.fastZ=wander(env,env.fastZ,mean*.07,.7,dt);
  if(!env.gust && env.time>=env.nextGustAt) {
    env.gust={start:env.time,duration:2+nextUniform(env)*2.5,amplitude:mean*(.3+nextUniform(env)*.35),offset:(nextUniform(env)-.5)*50*degree};
  }
  let gustSpeed=0,gustAngle=0;
  if(env.gust) {
    const phase=(env.time-env.gust.start)/env.gust.duration;
    if(phase>=1){env.nextGustAt=env.time+10+nextUniform(env)*25;env.gust=null;}
    else {gustSpeed=env.gust.amplitude*.5*(1-Math.cos(2*Math.PI*phase));gustAngle=env.gust.offset;}
  }
  // Wind blows toward the opposite of its "from" bearing; shear weakens it near the ground.
  const heading=env.windFromDeg*degree+env.direction+Math.PI;
  const shear=Math.pow(Math.max(height,.3)/windReferenceHeight,.2);
  let x=(Math.sin(heading)*mean+Math.sin(heading+gustAngle)*gustSpeed+env.slowX+env.fastX)*shear;
  let z=(Math.cos(heading)*mean+Math.cos(heading+gustAngle)*gustSpeed+env.slowZ+env.fastZ)*shear;
  const speed=Math.hypot(x,z);
  if(speed>windSpeedCap){x*=windSpeedCap/speed;z*=windSpeedCap/speed;}
  env.wind={x,z,speed:Math.min(speed,windSpeedCap)};
  return env.wind;
}
