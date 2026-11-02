/* Local audio adapters. Captured sound never leaves this device. */
(function (root) {
'use strict';
function bandsFromFFT(data, rate, fftSize, count=64) {
  const bands=new Array(count).fill(0), nyquist=rate/2, max=Math.min(16000,nyquist);
  for(let i=0;i<count;i++){
    const lo=35*Math.pow(max/35,i/count),hi=35*Math.pow(max/35,(i+1)/count);
    const start=Math.max(1,Math.floor(lo*fftSize/rate)),end=Math.min(data.length,Math.max(start+1,Math.ceil(hi*fftSize/rate)));
    let sum=0;for(let j=start;j<end;j++)sum+=data[j]*data[j];
    bands[i]=end>start?Math.sqrt(sum/(end-start))/255:0;
  }
  return bands;
}
class AudioEngine {
  constructor(options={}){this.options=options;this.generation=0;this.kind='demo';this.phase='idle';this.frame={bands:new Array(64).fill(0),rms:0};this.resources={};}
  state(phase,message){this.phase=phase;this.options.onState?.({kind:this.kind,phase,message});}
  async stop(){this.generation++;const r=this.resources;this.resources={};this.kind='demo';this.frame={bands:new Array(64).fill(0),rms:0};this.state('idle','Demo mode. No audio input.');clearTimeout(r.timer);if(r.socket){r.socket.onclose=null;r.socket.onerror=null;r.socket.close();}if(r.stream)r.stream.getTracks().forEach(t=>t.stop());if(r.media){r.media.pause();r.media.removeAttribute('src');r.media.load();}if(r.context)try{await r.context.close();}catch(_){}if(r.url)URL.revokeObjectURL(r.url);}
  async start(kind,file){const stopped=this.stop();const requested=this.generation;await stopped;if(requested!==this.generation)return;const generation=++this.generation;this.kind=kind;this.state('connecting','Waiting for audio input…');
    try{
      if(kind==='companion'){this.connectCompanion(generation);return;}
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw new Error('Web Audio is unavailable in this browser.');
      const context=new Context();this.resources.context=context;await context.resume();if(generation!==this.generation)return;
      const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.72;this.resources.analyser=analyser;
      this.resources.frequency=new Uint8Array(analyser.frequencyBinCount);this.resources.wave=new Float32Array(analyser.fftSize);
      if(kind==='file'){
        if(!file)throw new Error('Choose an audio file first.');const url=URL.createObjectURL(file);this.resources.url=url;const media=new Audio();this.resources.media=media;media.src=url;
        media.onended=()=>{if(generation===this.generation)this.state('ended','Audio file finished.');};media.onerror=()=>{if(generation===this.generation)this.state('error','This browser cannot decode that audio file. Try MP3 or WAV.');};
        context.createMediaElementSource(media).connect(analyser);analyser.connect(context.destination);await media.play();if(generation!==this.generation)return;this.options.onMetadata?.({title:file.name.replace(/\.[^.]+$/,''),artist:'Local audio file',album:'Local file · cover selected separately'});
      }else{
        let stream;if(kind==='tab'){
          if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Tab capture is unavailable here. Use microphone, an audio file, or the Windows companion.');
          stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:{suppressLocalAudioPlayback:false},systemAudio:'exclude',selfBrowserSurface:'exclude'});
        }else{
          if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost and a supported browser.');
          stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
        }
        if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
        this.resources.stream=stream;if(!stream.getAudioTracks().length)throw new Error('No audio was shared. Select a browser tab and enable Share tab audio, or choose another input.');
        stream.getTracks().forEach(track=>track.onended=()=>{if(generation===this.generation)this.stop();});context.createMediaStreamSource(stream).connect(analyser);
        this.options.onMetadata?.({title:'Listening to '+(kind==='tab'?'shared tab':'microphone'),artist:'Song not identified',album:'Live audio · choose a cover in lib'});
      }
      this.state('live',kind==='file'?'Local file playing.':'Listening locally. Song recognition is not connected.');
    }catch(error){if(generation!==this.generation)return;const message=error.name==='NotAllowedError'?'Audio sharing was cancelled or permission was denied.':error.message;await this.stop();this.state('error',message);}
  }
  connectCompanion(generation){
    if(location.hostname!=='127.0.0.1'||location.port!=='8765')throw new Error('Run NEON-Companion.exe, then use the local NEON page it opens. This avoids browser restrictions on remote pages accessing your computer.');
    const token=new URLSearchParams(location.hash.slice(1)).get('pair')||sessionStorage.getItem('neon-companion-pair');if(!token)throw new Error('Open the paired link shown by NEON Companion.');sessionStorage.setItem('neon-companion-pair',token);history.replaceState(null,'',location.pathname);
    const socket=new WebSocket('ws://127.0.0.1:8765/api/live');this.resources.socket=socket;
    this.resources.timer=setTimeout(()=>{if(generation===this.generation)this.fail('The companion did not respond. Reopen it and try again.');},7000);
    socket.onopen=()=>socket.send(JSON.stringify({token}));
    socket.onmessage=event=>{if(generation!==this.generation)return;let data;try{data=JSON.parse(event.data);}catch(_){return;}
      if(data.type==='ready'){clearTimeout(this.resources.timer);this.state('live','Connected to '+data.device+'. Audio stays on this computer.');}
      if(data.type==='spectrum'&&Array.isArray(data.bands)){this.frame={bands:data.bands.slice(0,64).map(v=>Math.max(0,Math.min(1,Number(v)||0))),rms:Math.max(0,Math.min(1,Number(data.rms)||0))};this.lastFrame=performance.now();}
      if(data.type==='metadata')this.options.onMetadata?.(data);
      if(data.type==='error')this.fail(data.message||'Companion capture failed.');
    };
    socket.onerror=()=>{if(generation===this.generation)this.fail('Cannot connect to the companion. Check that it is still running.');};socket.onclose=()=>{if(generation===this.generation)this.fail('Companion disconnected. Reconnect from the audio menu.');};
  }
  async fail(message){await this.stop();this.state('error',message);}
  sample(){const r=this.resources;if(this.kind==='companion'){if(performance.now()-(this.lastFrame||0)>700)return {bands:new Array(64).fill(0),rms:0};return this.frame;}if(!r.analyser||this.phase!=='live')return {bands:new Array(64).fill(0),rms:0};r.analyser.getByteFrequencyData(r.frequency);r.analyser.getFloatTimeDomainData(r.wave);let sum=0;for(const v of r.wave)sum+=v*v;this.frame={bands:bandsFromFFT(r.frequency,r.context.sampleRate,r.analyser.fftSize),rms:Math.min(1,Math.sqrt(sum/r.wave.length)*4)};return this.frame;}
  get media(){return this.resources.media;}
}
root.NEONAudio={AudioEngine,bandsFromFFT};if(typeof module!=='undefined')module.exports=root.NEONAudio;
})(typeof window!=='undefined'?window:globalThis);
