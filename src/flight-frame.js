import {flightModel} from './flight-physics.js';
// Shared by the display loop and physical-course verification. Long frames are
// bounded so returning to a background tab never catches up minutes of flight.
export function advanceFlightFrame(state,frameDt,input,physics,mission) {
  const step=flightModel.fixedStep;
  state.physicsAccumulator=Math.min(state.physicsAccumulator+Math.max(0,Math.min(.1,frameDt)),step*12);
  while(state.physicsAccumulator>=step) {
    if(state.paused){state.physicsAccumulator=0;break;}
    physics(step,input);
    mission(step,input);
    state.physicsAccumulator-=step;
  }
}
