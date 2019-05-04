// make safari happy
if (!window.AudioContext && window.webkitAudioContext) {
  const oldFunc = webkitAudioContext.prototype.decodeAudioData;
  webkitAudioContext.prototype.decodeAudioData = function(arraybuffer) {
    return new Promise((resolve, reject) => {
      oldFunc.call(this, arraybuffer, resolve, reject);
    });
  }
}

(async function() {
  function makeReverb(seconds = 1, decay = 3) {
    const reverb = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const length = rate * seconds;
    const impulse = ctx.createBuffer(2, length, rate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    function getVerbSample(sample) {
      return (Math.random() * 2 - 1) * Math.pow(1 - sample / length, decay);
    }
    
    for (let i = 0; i < length; i++) {
      impulseL[i] = getVerbSample(i);
      impulseR[i] = getVerbSample(i);
    }
    
    reverb.buffer = impulse;
    
    return reverb;
  }
  
  // Globals
  const S3_ROOT = 'https://s3.us-west-2.amazonaws.com/jkprow/';
  const FILES = ['beachboiz.wav', 'dnb.wav'];
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Wait for user gesture to init AudioContext
  if (ctx.state === 'suspended') {
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown'];
    await Promise.race(
      events.map(event => new Promise(resolve => {
        document.body.addEventListener(event, resolve, false);
      }))
    );
    events.forEach(e => document.body.removeEventListener(e, this));
    await ctx.resume();
  }
  
  // Set up base audio graph
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  dryGain.connect(ctx.destination);
  
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;
  wetGain.connect(ctx.destination);
  
  const reverb = makeReverb();
  reverb.connect(wetGain);
  
  // Fetch the loop files and set up their audio graph
  const loopNodes = await Promise.all(
    await FILES.map(async (loop, idx) => {
      const response = await fetch(S3_ROOT + loop);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const loopGain = ctx.createGain();
      const loopBufferSource = ctx.createBufferSource();
      loopGain.gain.value = 0;
      loopBufferSource.buffer = audioBuffer;
      loopBufferSource.connect(loopGain);
      loopGain.connect(reverb);
      loopGain.connect(dryGain);
      loopBufferSource.loop = true;
      return {
        loopGain,
        loopBufferSource,
      };
    })
  );

  // Once both loops are ready, kick them off
  const gains = loopNodes.map(({ loopGain, loopBufferSource }) => {
    loopBufferSource.start(0);
    return loopGain;
  });
  
  /**
   * Given a GainNode, toggle its gain from 0% to 100%
   * over a 1s ramp
   * @param {GainNode} gainNode
   */
  function toggleGain(gainNode) {
    const gain = gainNode.gain;
    gain.linearRampToValueAtTime(1 - gain.value, ctx.currentTime + 1);
  }
  
  // Set up event listeners
  const top = document.getElementById('top');
  const middle = document.getElementById('middle');
  const bottom = document.getElementById('bottom');

  top.addEventListener('click', () => {
    toggleGain(gains[0]);
  });

  middle.addEventListener('click', () => {
    toggleGain(wetGain);
    toggleGain(dryGain);
  });

  bottom.addEventListener('click', () => {
    toggleGain(gains[1]);
  });
})();