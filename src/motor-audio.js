// Synthesised rotor sound. A pilot hears thrust changes before seeing them, so pitch
// follows each motor. No recording: the tone is an approximation, not a measured aircraft.
const limit=(value,low,high)=>Math.max(low,Math.min(high,value));
export function motorAudioParameters(motors,maxThrustPerMotor,{distance=8.5,lateral=0}={}) {
  const spin=motors.map(thrust=>Math.sqrt(limit(thrust/maxThrustPerMotor,0,1)));
  const average=spin.reduce((sum,value)=>sum+value,0)/spin.length;
  return {
    frequencies:spin.map(value=>70+330*value),
    // Roughly inverse distance, so the aircraft fades as it moves away.
    gain:limit(average*1.6,0,1)*limit(8.5/Math.max(distance,1),.2,2.2)*.09,
    cutoff:700+2600*average,
    pan:limit(lateral/Math.max(distance,1),-.9,.9),
  };
}
export function createMotorAudio() {
  let context=null,master=null,filter=null,panner=null,voices=[];
  function start() {
    if(context){context.resume?.();return;}
    const Engine=window.AudioContext||window.webkitAudioContext;
    if(!Engine)return;
    context=new Engine();
    master=context.createGain();master.gain.value=0;
    filter=context.createBiquadFilter();filter.type='lowpass';
    panner=context.createStereoPanner();
    filter.connect(master);master.connect(panner);panner.connect(context.destination);
    voices=[0,1,2,3].map(()=>{
      const oscillator=context.createOscillator(),level=context.createGain();
      oscillator.type='sawtooth';level.gain.value=.25;
      oscillator.connect(level);level.connect(filter);oscillator.start();
      return oscillator;
    });
    // Broadband air noise under the tones.
    const samples=context.sampleRate*2,buffer=context.createBuffer(1,samples,context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<samples;i++)data[i]=Math.random()*2-1;
    const noise=context.createBufferSource(),noiseLevel=context.createGain();
    noise.buffer=buffer;noise.loop=true;noiseLevel.gain.value=.12;
    noise.connect(noiseLevel);noiseLevel.connect(filter);noise.start();
  }
  function update(parameters) {
    if(!context)return;
    const now=context.currentTime,smooth=.04;
    if(!parameters){master.gain.setTargetAtTime(0,now,.08);return;}
    parameters.frequencies.forEach((frequency,index)=>voices[index].frequency.setTargetAtTime(frequency,now,smooth));
    master.gain.setTargetAtTime(parameters.gain,now,smooth);
    filter.frequency.setTargetAtTime(parameters.cutoff,now,smooth);
    panner.pan.setTargetAtTime(parameters.pan,now,smooth);
  }
  return {start,update};
}
