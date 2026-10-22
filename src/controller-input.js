const neutralInput=()=>({throttle:0,yaw:0,forward:0,strafe:0});
const clamp=value=>Math.max(-1,Math.min(1,value));
export const controllerCheckSteps=Object.freeze([
  {label:'左スティックを上へいっぱいに倒してください（上昇）',axis:1,sign:-1},
  {label:'左スティックを下へいっぱいに倒してください（下降）',axis:1,sign:1},
  {label:'左スティックを左へいっぱいに倒してください（左旋回）',axis:0,sign:-1},
  {label:'左スティックを右へいっぱいに倒してください（右旋回）',axis:0,sign:1},
  {label:'右スティックを上へいっぱいに倒してください（前進）',axis:3,sign:-1},
  {label:'右スティックを下へいっぱいに倒してください（後退）',axis:3,sign:1},
  {label:'右スティックを左へいっぱいに倒してください（左移動）',axis:2,sign:-1},
  {label:'右スティックを右へいっぱいに倒してください（右移動）',axis:2,sign:1},
]);
export function normalizedAxis(value,neutral=0,deadzone=.08,min=-1,max=1) {
  if(![value,neutral,deadzone,min,max].every(Number.isFinite) || min>=neutral || max<=neutral || deadzone<0 || deadzone>=1)return 0;
  const v=clamp((value-neutral)/(value>=neutral?max-neutral:neutral-min));
  return Math.abs(v)<=deadzone?0:Math.sign(v)*(Math.abs(v)-deadzone)/(1-deadzone);
}
function padProblem(pad) {
  if(!pad)return 'コントローラーを接続し、ボタンを一度押してください。';
  if(pad.mapping!=='standard')return 'この入力配置には未対応です。ブラウザで標準配置と認識されるコントローラーを使ってください。';
  if(!pad.axes || pad.axes.length<4)return '左右2本・4軸のスティックが必要です。';
  if(!Array.from(pad.axes).slice(0,4).every(v=>Number.isFinite(v)&&Math.abs(v)<=1))return '入力値を読み取れません。接続を確認してください。';
  return null;
}
function validProfile(profile,pad) {
  return profile?.version===2 && profile.id===pad.id && profile.mapping==='standard' && profile.verified===true &&
    ['axes','min','max'].every(key=>Array.isArray(profile[key])&&profile[key].length===4&&profile[key].every(Number.isFinite)) &&
    profile.axes.every((v,i)=>Math.abs(v)<=.2 && profile.min[i]>=-1 && profile.min[i]<=-.7 && profile.max[i]>=.7 && profile.max[i]<=1);
}
function axesToInput(axes,profile) {
  const a=axes.map((v,i)=>normalizedAxis(v,profile?.axes[i]??0,.08,profile?.verified?profile.min[i]:-1,profile?.verified?profile.max[i]:1));
  return {throttle:-a[1]||0,yaw:a[0],forward:-a[3]||0,strafe:a[2]};
}
export function keyboardInput(keys) {
  return {throttle:Number(keys.has('KeyE'))-Number(keys.has('KeyQ')),yaw:Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),strafe:Number(keys.has('KeyD'))-Number(keys.has('KeyA'))};
}
export function inputCentered(input) {return Object.values(input).every(value=>Number.isFinite(value)&&Math.abs(value)<=.05);}
export function createControllerInput({load=()=>null,save=()=>{},now=()=>new Date().toISOString()}={}) {
  let pad=null,identity=null,profile=null,saved=null,stage='idle',index=0,held=0,centerSamples=[],min=[],max=[],saveFailed=false;
  function clearCheck() {index=0;held=0;centerSamples=[];min=Array(4).fill(0);max=Array(4).fill(0);}
  function requireConfirmation() {
    if(profile?.verified)saved=profile;
    profile=null;stage='idle';clearCheck();
  }
  function begin({full=false}={}) {
    if(padProblem(pad))return false;
    profile=null;stage=!full&&saved?'confirm':'center';clearCheck();return true;
  }
  function measureCenter(axes,dt) {
    if(dt<=0)return null;
    const centered=axes.every(v=>Math.abs(v)<=.2);
    const stable=centerSamples.every(row=>axes.every((v,i)=>Math.abs(v-row[i])<=.025));
    if(!centered || !stable){held=0;centerSamples=[];return null;}
    held+=dt;centerSamples.push([...axes]);
    if(held<.6)return null;
    return axes.map((_,i)=>centerSamples.reduce((sum,row)=>sum+row[i],0)/centerSamples.length);
  }
  function update(pads,dt=0) {
    dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    const connected=Array.from(pads||[]).filter(p=>p&&p.connected!==false);
    // Keep the current device even if another is plugged in. Never silently
    // substitute an uncalibrated controller while flying.
    const candidate=connected.find(p=>`${p.index}:${p.id}:${p.mapping}:${p.axes?.length}`===identity) || connected.find(p=>!padProblem(p)) || connected[0] || null;
    const nextIdentity=candidate?`${candidate.index}:${candidate.id}:${candidate.mapping}:${candidate.axes?.length}`:null;
    const changed=identity!==nextIdentity;
    if(changed) {
      identity=nextIdentity;pad=candidate;profile=null;saved=null;stage='idle';clearCheck();saveFailed=false;
      if(pad && !padProblem(pad)) {try {const stored=load();if(validProfile(stored,pad))saved=structuredClone(stored);}catch{}}
    } else pad=candidate;
    const problem=padProblem(pad);
    if(problem) {profile=null;stage='idle';clearCheck();}
    const axes=pad?.axes?Array.from(pad.axes).slice(0,4):[];
    if(!problem && ['direction','return'].includes(stage))axes.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
    if(!problem && ['center','confirm'].includes(stage)) {
      const center=measureCenter(axes,dt);
      if(center) {
        held=0;centerSamples=[];
        if(stage==='confirm') {
          // A changed neutral means the saved setup is no longer trusted.
          if(center.every((v,i)=>Math.abs(v-saved.axes[i])<=.04)){profile=structuredClone(saved);stage='ready';}
          else {saved=null;stage='idle';}
        } else {profile={version:2,id:pad.id,mapping:pad.mapping,axes:center,min,max,verified:false};stage='direction';}
      }
    } else if(!problem && stage==='direction') {
      const step=controllerCheckSteps[index];
      const correct=axes[step.axis]*step.sign>=.7 && axes.every((v,i)=>i===step.axis || Math.abs(v-profile.axes[i])<=.2);
      held=correct?held+dt:0;
      if(held>=.15){held=0;stage='return';}
    } else if(!problem && stage==='return') {
      const center=measureCenter(axes,dt);
      if(center) {
        held=0;centerSamples=[];index++;
        if(index===controllerCheckSteps.length) {
          profile={...profile,min:[...min],max:[...max],verified:true,at:now()};
          saved=structuredClone(profile);stage='ready';
          saveFailed=false;
          try {save(structuredClone(profile));}catch{saveFailed=true;}
        } else stage='direction';
      }
    }
    const ready=!problem && stage==='ready';
    const preview=!problem?axesToInput(axes,profile||saved):neutralInput();
    const instruction=problem || (stage==='ready'?(saveFailed?'操作確認は完了しました。設定を保存できないため、再読み込み後にもう一度確認してください。':'操作確認と校正が完了しました。中立に戻して開始できます。'):
      stage==='center' || stage==='confirm'?'両方のスティックから手を離し、中央で静止させてください。':
      stage==='direction'?controllerCheckSteps[index].label:
      stage==='return'?'中央へ戻し、両方のスティックから手を離してください。':
      saved?'保存した設定があります。中立の確認を始めてください。':'操作確認を始め、左右のスティックを一方向ずつ動かしてください。');
    return {connected:Boolean(pad),compatible:!problem,id:pad?.id||null,padIndex:pad?.index??null,axes,changed,stage,step:index,steps:controllerCheckSteps.length,instruction,canFly:ready,centered:ready&&inputCentered(preview),input:ready?preview:neutralInput(),preview,calibration:ready?structuredClone(profile):null,hasSaved:Boolean(saved),saveFailed};
  }
  return {update,begin,requireConfirmation};
}
