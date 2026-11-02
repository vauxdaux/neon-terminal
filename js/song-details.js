/* Song metadata lookups. Only artist/title/album/duration leave the browser, never audio. */
(function(root){
'use strict';
const clean=value=>String(value??'').replace(/[|\u0000-\u001f]/g,' ').trim().slice(0,200);
const normalize=value=>clean(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function usableTrack(track){return !!clean(track?.title)&&!!clean(track?.artist)&&!['neon sessions','local audio file','song not identified','track details unavailable','start music in a player that supports windows media controls'].includes(normalize(track.artist))&&!['no active player','waiting for audio','listening to computer audio','listening to shared tab','listening to microphone'].includes(normalize(track.title));}
function scaleFrame(frame,gain=1){gain=Number.isFinite(Number(gain))?Math.max(0,Math.min(3,Number(gain))):1;return {bands:Array.from(frame?.bands||[],v=>Math.max(0,Math.min(1,(Number(v)||0)*gain))),rms:Math.max(0,Math.min(1,(Number(frame?.rms)||0)*gain))};}
function parseLRC(text){const entries=[];let offset=0;const rows=String(text||'').slice(0,150000).split(/\r?\n/);for(const row of rows){const match=row.match(/\[offset:([+-]?\d+)\]/i);if(match)offset=Number(match[1])/1000;}for(const row of rows){const stamps=[...row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];if(!stamps.length)continue;const value=row.replace(/\[[^\]]*\]/g,'').trim().slice(0,2000);for(const stamp of stamps){if(+stamp[2]>=60)continue;entries.push({time:Math.max(0,+stamp[1]*60+ +stamp[2]-offset),text:value});if(entries.length>=5000)break;}if(entries.length>=5000)break;}return entries.sort((a,b)=>a.time-b.time);}
function lyricIndex(lines,seconds){let lo=0,hi=lines.length-1,result=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(lines[mid].time<=seconds){result=mid;lo=mid+1;}else hi=mid-1;}return result;}
function matchesLyrics(record,track){return normalize(record.trackName||record.name)===normalize(track.title)&&normalize(record.artistName)===normalize(track.artist)&&(!(track.duration>0)||!(Number(record.duration)>0)||Math.abs(Number(record.duration)-track.duration)<=3);}
function lyricsResult(record){const lines=parseLRC(record.syncedLyrics);return {status:record.instrumental?'instrumental':lines.length?'synced':record.plainLyrics?'plain':'not-found',lines,plain:String(record.plainLyrics||'').slice(0,100000),sourceUrl:Number.isSafeInteger(record.id)&&record.id>0?'https://lrclib.net/tracks/'+record.id:'https://lrclib.net/',provider:'LRCLIB'};}
async function jsonRequest(url,signal,fetcher){const response=await fetcher(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});if(response.status===404)return null;if(!response.ok)throw new Error(response.status===429?'Service is busy. Try again later.':'Online source unavailable.');return response.json();}
async function fetchLyrics(track,signal,fetcher){
 const parameters=new URLSearchParams({artist_name:clean(track.artist),track_name:clean(track.title)});if(track.album)parameters.set('album_name',clean(track.album));if(track.duration>0)parameters.set('duration',String(Math.round(track.duration)));
 if(track.album&&track.duration>0){const record=await jsonRequest('https://lrclib.net/api/get?'+parameters,signal,fetcher);if(record&&matchesLyrics(record,track))return lyricsResult(record);}
 const search=new URLSearchParams({artist_name:clean(track.artist),track_name:clean(track.title)});const records=await jsonRequest('https://lrclib.net/api/search?'+search,signal,fetcher);
 const candidates=Array.isArray(records)?records.filter(r=>matchesLyrics(r,track)):[];candidates.sort((a,b)=>(normalize(b.albumName)===normalize(track.album)?1:0)-(normalize(a.albumName)===normalize(track.album)?1:0)||Math.abs((Number(a.duration)||0)-(track.duration||0))-Math.abs((Number(b.duration)||0)-(track.duration||0)));
 return candidates.length?lyricsResult(candidates[0]):{status:'not-found',lines:[],plain:'',sourceUrl:'https://lrclib.net/',provider:'LRCLIB'};
}
const wikiCache=new Map();
async function fetchWiki(track,kind,signal,fetcher){
 const name=clean(kind==='artist'?track.artist:track.title),artist=clean(track.artist),cacheKey=kind+'|'+normalize(name)+(kind==='song'?'|'+normalize(artist):'');const cached=wikiCache.get(cacheKey);if(cached&&Date.now()-cached.time<3600000)return cached.value;
 const titles=kind==='artist'?[name,name+' (singer)',name+' (band)',name+' (musician)']:[name,name+' (song)',name+' ('+artist+' song)'];
 const params=new URLSearchParams({action:'query',prop:'extracts|info|pageprops',titles:titles.join('|'),redirects:'1',exintro:'1',explaintext:'1',exsentences:'5',inprop:'url',format:'json',formatversion:'2',origin:'*'});
 const result=await jsonRequest('https://en.wikipedia.org/w/api.php?'+params,signal,fetcher);const pages=result?.query?.pages||[];
 const page=pages.find(p=>!p.missing&&!(p.pageprops&&Object.hasOwn(p.pageprops,'disambiguation'))&&p.extract&& (kind==='artist'?/\b(band|musician|singer|rapper|songwriter|duo|music group|rock group|pop group)\b/i.test(p.extract.slice(0,350)):(normalize(p.extract).includes(normalize(artist))&&/\b(song|single|track)\b/i.test(p.extract.slice(0,350)))));
 if(!page)return {status:'not-found',provider:'Wikipedia'};
 let url='https://en.wikipedia.org/wiki/'+encodeURIComponent(page.title.replaceAll(' ','_'));try{const supplied=new URL(page.fullurl);if(supplied.origin==='https://en.wikipedia.org')url=supplied.href;}catch(_){}
 const value={status:'found',title:page.title,text:String(page.extract).slice(0,2500),sourceUrl:url,provider:'Wikipedia'};
 wikiCache.set(cacheKey,{time:Date.now(),value});if(wikiCache.size>50)wikiCache.delete(wikiCache.keys().next().value);return value;
}
async function fetchDetails(track,signal,fetcher=root.fetch.bind(root)){
 const results=await Promise.allSettled([fetchWiki(track,'artist',signal,fetcher),fetchWiki(track,'song',signal,fetcher),fetchLyrics(track,signal,fetcher)]);
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const value=(i,provider)=>results[i].status==='fulfilled'?results[i].value:{status:'unavailable',provider,message:results[i].reason?.message||'Source unavailable.'};
 return {query:track,artist:value(0,'Wikipedia'),song:value(1,'Wikipedia'),lyrics:value(2,'LRCLIB')};
}
class DetailsController{
 constructor(options={}){this.options=options;this.cache=new Map();this.generation=0;this.key='';this.state={status:'idle'};}
 emit(state){this.state=state;this.options.onChange?.(state);}
 cancel(){this.generation++;clearTimeout(this.timer);clearTimeout(this.deadline);this.abort?.abort();this.abort=null;}
 update(track,{enabled=true,force=false}={}){
  const query={title:clean(track?.title),artist:clean(track?.artist),album:clean(track?.album),duration:Math.max(0,Math.round(Number(track?.duration)||0))};
  const key=JSON.stringify(query);if(!force&&key===this.key&&enabled&&this.state.status!=='disabled')return;
  this.cancel();this.key=key;
  if(!enabled){this.emit({status:'disabled',query});return;}if(!usableTrack(query)){this.emit({status:'idle',query});return;}
  const cached=this.cache.get(key);if(!force&&cached&&Date.now()-cached.time<3600000){this.emit({status:'ready',query,details:cached.value});return;}
  this.emit({status:'loading',query});const generation=this.generation;
  this.timer=setTimeout(async()=>{if(generation!==this.generation)return;const abort=new AbortController();this.abort=abort;const deadline=setTimeout(()=>abort.abort(),15000);this.deadline=deadline;
   try{const value=await (this.options.fetchDetails||fetchDetails)(query,abort.signal);if(generation!==this.generation)return;if([value.artist,value.song,value.lyrics].some(item=>item&&item.status!=='unavailable'))this.cache.set(key,{time:Date.now(),value});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);this.emit({status:'ready',query,details:value});}
   catch(error){if(generation===this.generation)this.emit({status:'error',query,message:abort.signal.aborted?'Online lookup timed out. Try again.':error.message});}
   finally{clearTimeout(deadline);}
  },this.options.delay??500);
 }
}
root.NEONDetails={scaleFrame,normalize,usableTrack,parseLRC,lyricIndex,matchesLyrics,fetchDetails,DetailsController};if(typeof module!=='undefined')module.exports=root.NEONDetails;
})(typeof window!=='undefined'?window:globalThis);
