// Controls narration requests; the browser owns pronunciation and audio output.
export function createPresentationNarrator({speak,stop}) {
  let lastStep=null;
  function reset() {stop();lastStep=null;}
  return {
    reset,
    update({enabled,paused,done,stepIndex,caption}) {
      if(!enabled || paused || done) {
        if(lastStep!==null)reset();
        return;
      }
      if(lastStep===stepIndex)return;
      reset();speak(caption);lastStep=stepIndex;
    },
  };
}
