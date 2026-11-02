/* Local canvas effect. Uses lyrics already loaded by the display; makes no requests. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function cueAt(lines,position){let lo=0,hi=lines.length-1,index=-1;while(lo<=hi){const m=(lo+hi)>>1;if(lines[m].time<=position){index=m;lo=m+1;}else hi=m-1;}return index;}
// Reject any glyph rectangle that intersects a bright artwork cell. Letterbox space is free.
function artworkMask(pixels,cols,rows,rect,threshold=.22){
 if(!pixels||!cols||!rows||!rect.width||!rect.height)return ()=>true;
 const cw=rect.width/cols,ch=rect.height/rows,blocked=new Uint8Array(cols*rows);
 for(let i=0;i<blocked.length;i++)blocked[i]=(pixels[i*4]*.299+pixels[i*4+1]*.587+pixels[i*4+2]*.114)/255>threshold?1:0;
 return (x,y,w,h)=>{const left=x-3,right=x+w+3,top=y-3,bottom=y+h+3;if(right<=rect.x||left>=rect.x+rect.width||bottom<=rect.y||top>=rect.y+rect.height)return true;
  const x0=clamp(Math.floor((left-rect.x)/cw),0,cols-1),x1=clamp(Math.floor((right-rect.x)/cw),0,cols-1),y0=clamp(Math.floor((top-rect.y)/ch),0,rows-1),y1=clamp(Math.floor((bottom-rect.y)/ch),0,rows-1);
  for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)if(blocked[j*cols+i])return false;return true;
 };
}
class LyricRain {
 constructor(canvas,{random=Math.random}={}){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.random=random;this.width=0;this.height=0;this.size=14;this.streams=[];this.lines=[];this.key='';this.value=null;this.mask=()=>true;this.reset();}
 reset(){this.streams=[];this.cue=-1;this.sequence=0;this.elapsed=0;this.lastPosition=null;this.currentText='';}
 resize(width,height,dpr=1){this.width=Math.max(1,width);this.height=Math.max(1,height);this.size=clamp(Math.floor(width/85),12,20);const d=clamp(dpr,1,2);this.canvas.width=Math.round(this.width*d);this.canvas.height=Math.round(this.height*d);this.ctx.setTransform(d,0,0,d,0,0);this.streams=[];this.cue=-1;}
 setMask(mask){this.mask=mask||(()=>true);}
 setLyrics(value,key){if(this.value===value&&this.key===key)return;if(this.key===key&&this.value?.status===value?.status&&this.value?.plain===value?.plain&&this.value?.lines===value?.lines)return;
  this.value=value;this.key=key;this.reset();this.timed=value?.status==='synced';
  this.lines=this.timed?(value.lines||[]).slice(0,5000):value?.status==='plain'?String(value.plain||'').split(/\r?\n/).map(text=>({text:text.trim()})).filter(line=>line.text).slice(0,5000):[];
 }
 spawn(text){if(!text.trim())return;const chars=Array.from(text.replace(/\s+/g,' ').trim()).slice(0,120),step=this.size*1.45,columns=Math.max(1,Math.floor((this.width-12)/step));
  // Prefer lanes that have the most free space, but vary placement between phrases.
  const lanes=[];for(let c=0;c<columns;c++){let free=0;const x=6+c*step;for(let y=0;y<this.height;y+=this.size*2)if(this.mask(x,y,this.size*.65,this.size))free++;lanes.push({x,score:free+this.random()*3});}
  lanes.sort((a,b)=>b.score-a.score);const copies=Math.min(this.width>1000?6:this.width>550?4:2,lanes.length);
  const fresh=this.streams.length===0;for(let i=0;i<copies;i++){const lane=lanes.splice(Math.floor(this.random()*Math.min(8,lanes.length)),1)[0];if(!lane)break;this.streams.push({x:lane.x,y:fresh?this.random()*this.height*.7:this.random()*this.size*2,chars,speed:45+this.random()*45});}
  if(this.streams.length>28)this.streams.splice(0,this.streams.length-28);
 }
 advance(dt,{enabled=true,playing=true,position=0,hasTimeline=false,gain=1,level=0,motion=1,reduced=false}={}){
  if(!enabled||!this.lines.length)return;dt=clamp(Number(dt)||0,0,.1);gain=clamp(Number(gain)||0,0,3);const moves=playing&&gain>0&&motion>0&&!reduced;
  if(this.timed&&hasTimeline){if(this.lastPosition!==null&&(position<this.lastPosition-.4||position-this.lastPosition>2.5)){this.streams=[];this.cue=-1;}this.lastPosition=position;
   const cue=cueAt(this.lines,position);if(cue!==this.cue){this.cue=cue;this.currentText=cue>=0?this.lines[cue].text:'';if(this.currentText&&!reduced&&gain>0&&motion>0)this.spawn(this.currentText);}
  }else{if(this.cue<0){this.cue=0;this.currentText=this.lines[this.sequence].text;if(!reduced&&gain>0&&motion>0)this.spawn(this.currentText);}if(moves){this.elapsed+=dt;if(this.elapsed>=5){this.elapsed=0;this.sequence=(this.sequence+1)%this.lines.length;this.currentText=this.lines[this.sequence].text;this.spawn(this.currentText);}}}
  if(moves){const factor=gain*(.3+.7*clamp(motion,0,1));for(const stream of this.streams)stream.y+=dt*(stream.speed*factor+clamp(level,0,1)*70);this.streams=this.streams.filter(s=>s.y-s.chars.length*this.size<this.height);}
 }
 draw({enabled=true,ink='#ff4ec1',bright='#ffb8e4',reduced=false}={}){const c=this.ctx;c.clearRect(0,0,this.width,this.height);if(!enabled||reduced)return;c.font=this.size+'px monospace';c.textBaseline='top';
  for(const stream of this.streams){for(let i=0;i<stream.chars.length;i++){const y=stream.y-(stream.chars.length-1-i)*this.size;if(y<0||y+this.size>this.height||!this.mask(stream.x,y,this.size*.65,this.size))continue;const head=i===stream.chars.length-1;c.fillStyle=head?bright:ink;c.globalAlpha=head?.95:.2+.5*(i/stream.chars.length);c.fillText(stream.chars[i],stream.x,y);}}
  c.globalAlpha=1;
 }
}
root.NEONRain={LyricRain,artworkMask,cueAt};if(typeof module!=='undefined')module.exports=root.NEONRain;
})(typeof window!=='undefined'?window:globalThis);
