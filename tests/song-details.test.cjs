const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scaleFrame,parseLRC,lyricIndex,matchesLyrics,usableTrack,fetchDetails,DetailsController}=require('../js/song-details.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const track={title:'Signal Garden',artist:'Circuit Ensemble',album:'Night Signals',duration:180};
test('sensitivity affects all bands and RMS, supports zero and caps maximum',()=>{
 const raw={bands:[.1,.5,1],rms:.3};assert.deepEqual(scaleFrame(raw,0),{bands:[0,0,0],rms:0});assert.deepEqual(scaleFrame(raw,1),raw);assert.deepEqual(scaleFrame(raw,3),{bands:[.30000000000000004,1,1],rms:.8999999999999999});assert.deepEqual(raw,{bands:[.1,.5,1],rms:.3});
});
test('LRC parsing supports duplicate stamps, offsets, sorting and seeking',()=>{
 const cues=parseLRC('[ar:Circuit Ensemble]\n[offset:500]\n[00:10.20][00:20.20]An invented test line\n[00:02]Another invented line\n[00:72]invalid');assert.deepEqual(cues.map(c=>c.time),[1.5,9.7,19.7]);assert.equal(lyricIndex(cues,0),-1);assert.equal(lyricIndex(cues,10),1);assert.equal(lyricIndex(cues,2),0);assert.equal(lyricIndex(cues,100),2);
});
test('lyrics reject different recordings, durations and unidentified audio',()=>{
 const candidate={trackName:track.title,artistName:track.artist,duration:182};assert.equal(matchesLyrics(candidate,track),true);assert.equal(matchesLyrics({...candidate,duration:190},track),false);assert.equal(matchesLyrics({...candidate,trackName:track.title+' Live'},track),false);assert.equal(usableTrack({title:'Listening to microphone',artist:'Song not identified'}),false);assert.equal(usableTrack({...track,artist:'NEON Sessions'}),false);
});
test('lookup combines sourced introductions with matching synced lyrics and excludes disambiguations',async()=>{
 const requests=[];const fetcher=async url=>{requests.push(url);const u=new URL(url);let data;
 if(u.hostname==='lrclib.net')data={id:123,...{trackName:track.title,artistName:track.artist,albumName:track.album,duration:180},syncedLyrics:'[00:01]An original test line'};
 else if(u.searchParams.get('titles').startsWith(track.artist))data={query:{pages:[{title:track.artist,extract:'A band ambiguity.',pageprops:{disambiguation:''}},{title:track.artist+' (band)',extract:'Circuit Ensemble is a fictional band used only for this test.',fullurl:'https://en.wikipedia.org/wiki/Circuit_Ensemble'}]}};
 else data={query:{pages:[{title:track.title,extract:'Signal Garden is a fictional song by Circuit Ensemble used for tests.',fullurl:'https://en.wikipedia.org/wiki/Signal_Garden'}]}};
 return {ok:true,status:200,json:async()=>u.pathname==='/api/search'? [data]:data};};
 const result=await fetchDetails(track,new AbortController().signal,fetcher);assert.equal(result.artist.title,track.artist+' (band)');assert.equal(result.song.status,'found');assert.equal(result.lyrics.status,'synced');assert.equal(result.lyrics.lines.length,1);assert.equal(requests.length,3);assert(requests.filter(url=>url.includes('w/api.php')).every(url=>new URL(url).searchParams.get('exlimit')==='max'));assert(requests.every(url=>!url.includes('audio=')));
});
test('missing exact lyrics fall back to search; unrelated results are not displayed',async()=>{
 const query={title:'Different Test Title',artist:'Another Test Artist',album:'Test Album',duration:150};let searched=false;
 const result=await fetchDetails(query,new AbortController().signal,async url=>{if(url.includes('/api/get?'))return {ok:false,status:404};if(url.includes('/api/search?')){searched=true;return {ok:true,status:200,json:async()=>[{trackName:'Wrong title',artistName:query.artist,plainLyrics:'Invented test words'}]};}return {ok:true,status:200,json:async()=>({query:{pages:[]}})};});assert(searched);assert.equal(result.lyrics.status,'not-found');assert.equal(result.song.status,'not-found');
});
test('individual service failures retain unavailable states',async()=>{
 const result=await fetchDetails({title:'Offline Track',artist:'Offline Artist'},new AbortController().signal,async()=>{throw new Error('Offline');});assert.equal(result.artist.status,'unavailable');assert.equal(result.lyrics.status,'unavailable');
});
test('new tracks abort prior lookups, ignore stale answers and cache current results',async()=>{
 let calls=[];let resolveFirst;const states=[];
 const controller=new DetailsController({delay:0,onChange:s=>states.push(s),fetchDetails:async(q,signal)=>{calls.push({q,signal});if(calls.length===1)return new Promise(resolve=>resolveFirst=resolve);return {artist:{status:'found'},song:{status:'not-found'},lyrics:{status:'plain'}};}});
 controller.update(track);await sleep(10);controller.update({...track,title:'Next Signal'});await sleep(10);assert(calls[0].signal.aborted);resolveFirst({artist:{status:'found'}});await sleep(10);assert.equal(controller.state.query.title,'Next Signal');assert.equal(controller.state.status,'ready');assert.equal(states.filter(s=>s.status==='ready').length,1);
 controller.update(track,{enabled:false});controller.update({...track,title:'Next Signal'});assert.equal(controller.state.status,'ready');assert.equal(calls.length,2);controller.cancel();
});
test('disabled details do not fetch and refresh retries service failures',async()=>{
 let calls=0;const controller=new DetailsController({delay:0,fetchDetails:async()=>{calls++;return {artist:{status:'unavailable'},song:{status:'unavailable'},lyrics:{status:'unavailable'}};}});controller.update(track,{enabled:false});await sleep(5);assert.equal(calls,0);controller.update(track);await sleep(10);controller.update(track,{force:true});await sleep(10);assert.equal(calls,2);controller.cancel();
});

test('catalogue search still finds lyrics if the exact-record endpoint is unavailable',async()=>{
 const query={title:'Fallback Signal',artist:'Fallback Ensemble',album:'Fallback Album',duration:180};const result=await fetchDetails(query,new AbortController().signal,async url=>{if(url.includes('/api/get?'))return {ok:false,status:503};return {ok:true,status:200,json:async()=>url.includes('/api/search?')?[{id:8,trackName:query.title,artistName:query.artist,duration:180,plainLyrics:'An invented fallback test line'}]:{query:{pages:[]}}};});assert.equal(result.lyrics.status,'plain');
});

test('remastered tracks and small duration changes still show lyrics without unsafe timing',async()=>{
 const query={title:'Signal Garden - 2011 Remaster',artist:'Circuit Ensemble',album:'New Album',duration:210};const result=await fetchDetails(query,new AbortController().signal,async url=>({ok:true,status:200,json:async()=>url.includes('/api/search?')?[{id:99,trackName:'Signal Garden',artistName:'Circuit Ensemble',duration:180,syncedLyrics:'[00:01]Invented remaster test words'}]:{query:{pages:[]}}}));assert.equal(result.lyrics.status,'plain');assert.equal(result.lyrics.lines.length,0);assert(result.lyrics.note.includes('different duration'));
});
test('facts are delivered before a slow lyrics response',async()=>{
 const partial=[];let releaseLyrics;
 const pending=fetchDetails({title:'Early Fact Track',artist:'Early Fact Band'},new AbortController().signal,async url=>{
  if(url.includes('/api/search?'))await new Promise(resolve=>releaseLyrics=resolve);
  return {ok:true,status:200,json:async()=>url.includes('/api/search?')?[]:{query:{pages:[{title:'Early Fact Band',extract:'Early Fact Band is a fictional band for this test.'}]}}};
 },value=>partial.push(value));
 await sleep(5);assert(partial.some(value=>value.artist.status==='found'&&value.lyrics.status==='loading'));releaseLyrics();await pending;
});
test('local lookups use the paired companion route, with the key in a header',async()=>{
 const saved={location:global.location,sessionStorage:global.sessionStorage,fetch:global.fetch};const calls=[];
 try{global.location={hostname:'127.0.0.1',port:'8765',hash:'#pair=test-key'};global.sessionStorage={getItem:()=>null};global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true};};
  await require('../js/song-details.js').lookupFetch('https://en.wikipedia.org/w/api.php?action=query&titles=Test',{});
  assert(calls[0].url.startsWith('/api/lookup/wiki?'));assert(!calls[0].url.includes('test-key'));assert.equal(calls[0].options.headers['X-NEON-Pair'],'test-key');
 }finally{Object.assign(global,saved);}
});
test('a failed LRCLIB request falls back to a separately labelled plain lyrics provider',async()=>{
 const result=await fetchDetails({title:'Fallback Provider Track',artist:'Fallback Provider Artist'},new AbortController().signal,async url=>({ok:!url.includes('lrclib.net'),status:url.includes('lrclib.net')?503:200,json:async()=>url.includes('api.lyrics.ovh')?{lyrics:'Invented fallback provider words'}:{query:{pages:[]}}}));assert.equal(result.lyrics.status,'plain');assert.equal(result.lyrics.provider,'Lyrics.ovh');assert.equal(result.lyrics.lines.length,0);
});
