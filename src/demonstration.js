import { layouts, squarePath, eightCenters, abnormalTargets } from './course-layout.js';
const tau=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function createDemonstration(subject='square') {
  const courses=subject==='full'?['square','eight','abnormal']:[subject==='demo'?'square':subject];
  const steps=[];let total=0;
  for(const id of courses) {
    const layout=layouts[id];let position={...layout.takeoff,y:0},yaw=0;
    function step(to,duration,phase,caption,options={}) {
      const endYaw=options.yaw??yaw;
      steps.push({start:total,end:total+duration,from:{...position},to:{...to},fromYaw:yaw,toYaw:endYaw,courseId:id,phase,caption,...options});
      total+=duration;position={...to};yaw=endYaw;
    }
    const elevated={...layout.takeoff,y:layout.altitude};
    step(position,3,'preflight',`${layout.title}。青いHから離陸します。${layout.dimensions[0]}。`);
    step(elevated,layout.altitude/0.7,'takeoff',`機首を受験者から見て前方へ向け、高度${layout.altitude}mまで上昇します。`);
    step(position,5,'hover',`位置と高度を保って5秒間ホバリングします。`);
    const move=(point,phase,caption,heading=true)=>{
      const to={...point,y:layout.altitude};
      const nextYaw=heading?Math.atan2(to.x-position.x,to.z-position.z):0;
      step(position,1,'turn',heading?'機首を進行方向へ合わせます。':'機首を前方へ向けたまま、次の区間へ移ります。',{yaw:nextYaw});
      step(to,Math.max(1,Math.hypot(to.x-position.x,to.z-position.z)/1.1),phase,caption,{yaw:nextYaw});
    };
    if(id==='square') {
      for(const p of squarePath) move(p,'square',`${p.label}点へ直線飛行します。高度3.5mと機首方向を維持します。`);
      move(layout.takeoff,'return','A点からHへ戻り、着陸準備をします。',false);
    } else if(id==='eight') {
      step(position,1,'turn','機首を円の接線方向へ向けます。',{yaw:0});
      for(let lap=0;lap<2;lap++) for(let lobe=0;lobe<2;lobe++) {
        const fromAngle=lobe===0?0:Math.PI,sign=lobe===0?1:-1;
        const yawStart=Math.atan2(-sign*Math.sin(fromAngle),sign*Math.cos(fromAngle));
        const rampIn=lap===0 && lobe===0,rampOut=lap===1 && lobe===1;
        step({...layout.takeoff,y:1.5},16+((rampIn||rampOut)?0.5:0),'eight',`${lap+1}周目。${lobe+1}番コーンを囲み、機首を進行方向へ向けて円弧を飛行します。`,{arc:{center:eightCenters[lobe],fromAngle,sign,rampIn,rampOut},yaw:yawStart});
      }
    } else {
      for(const [index,point] of abnormalTargets.entries()) move(point,'abnormal',index===0?'A点へ準備移動します。機首を前方へ向けたまま、高度3.5mを保ちます。':`${point.label}点へ側方移動。位置安定OFFのため、流れを早めに抑えます。`,false);
      step(position,3,'emergencyHover','緊急事態発生。その場で停止し、位置と高度を保ちます。');
      move(layout.takeoff,'emergencyTransit','緊急着陸指示。高度3.5mを維持したまま、最短経路でH上空へ移動します。',false);
    }
    step({...layout.takeoff,y:0},layout.altitude/.55,'landing','H上空で水平移動を止めてから、静かに降下して着陸します。');
    step(position,3,'complete',`${layout.title}の見本を終了しました。次はご自身で操作してみましょう。`);
  }
  return {
    duration:total,steps,
    sample(time) {
      const t=Math.max(0,Math.min(total,time));
      const index=steps.findIndex(s=>t<s.end);const step=steps[index<0?steps.length-1:index];
      const progress=Math.max(0,Math.min(1,(t-step.start)/(step.end-step.start)));
      const eased=progress*progress*(3-2*progress);
      let position={x:step.from.x+(step.to.x-step.from.x)*eased,y:step.from.y+(step.to.y-step.from.y)*eased,z:step.from.z+(step.to.z-step.from.z)*eased};
      const rate=6*progress*(1-progress)/(step.end-step.start);
      let velocity={x:(step.to.x-step.from.x)*rate,y:(step.to.y-step.from.y)*rate,z:(step.to.z-step.from.z)*rate};
      let yaw=step.fromYaw+angleDelta(step.fromYaw,step.toYaw)*eased;
      if(step.arc) {
        const elapsed=t-step.start,duration=step.end-step.start;
        // One second to enter/leave the complete figure eight; no stops at H between lobes.
        const entry=step.arc.rampIn?Math.min(1,elapsed):1;
        const exit=step.arc.rampOut?Math.min(1,duration-elapsed):1;
        let travel=step.arc.rampIn?(elapsed<1?elapsed*elapsed/2:elapsed-.5):elapsed;
        if(step.arc.rampOut)travel-=Math.max(0,elapsed-(duration-1))**2/2;
        const angle=step.arc.fromAngle+step.arc.sign*tau*travel/16;
        position={x:step.arc.center.x+Math.cos(angle)*2.5,z:step.arc.center.z+Math.sin(angle)*2.5,y:1.5};
        yaw=Math.atan2(-step.arc.sign*Math.sin(angle),step.arc.sign*Math.cos(angle));
        const angularRate=step.arc.sign*tau/16*entry*exit;
        velocity={x:-Math.sin(angle)*2.5*angularRate,y:0,z:Math.cos(angle)*2.5*angularRate};
      }
      return {...position,yaw,velocity,courseId:step.courseId,phase:step.phase,caption:step.caption,stepIndex:index<0?steps.length-1:index,progress:t/total,done:t>=total};
    },
  };
}
