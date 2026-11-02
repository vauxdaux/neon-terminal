const {test}=require('node:test'),assert=require('node:assert/strict');
const {LyricRain,artworkMask}=require('../js/lyric-rain.js');
function setup(){const calls=[];const context={setTransform(){},clearRect(){},fillText(...args){calls.push(args)}};const rain=new LyricRain({getContext:()=>context},{random:()=>.4});rain.resize(900,600);return {rain,calls};}
const lyrics={status:'synced',lines:[{time:0,text:'Original test lyric one'},{time:10,text:'Original test lyric two'},{time:20,text:'Original test lyric three'}]};
test('timed rain uses the current cue and clears trails on seeking and track changes',()=>{
 const {rain}=setup();rain.setLyrics(lyrics,'one');rain.advance(.1,{position:0,hasTimeline:true});assert.equal(rain.currentText,lyrics.lines[0].text);const old=rain.streams[0];rain.advance(.1,{position:1,hasTimeline:true});assert.equal(rain.streams[0],old);rain.advance(.1,{position:21,hasTimeline:true});assert.equal(rain.currentText,lyrics.lines[2].text);assert(!rain.streams.includes(old));rain.advance(.1,{position:2,hasTimeline:true});assert.equal(rain.currentText,lyrics.lines[0].text);rain.setLyrics(null,'two');assert.equal(rain.currentText,'');assert.equal(rain.streams.length,0);
});
test('rain freezes on pause, zero sensitivity and zero motion; higher sensitivity moves farther',()=>{
 const {rain}=setup();rain.setLyrics(lyrics,'one');rain.advance(0,{position:0,hasTimeline:true});const stream=rain.streams[0],y=stream.y;
 for(const options of [{playing:false},{gain:0},{motion:0},{reduced:true}])rain.advance(.1,{position:0,hasTimeline:true,...options});assert.equal(stream.y,y);
 rain.advance(.1,{position:0,hasTimeline:true,gain:1});const normal=stream.y-y;const before=stream.y;rain.advance(.1,{position:0,hasTimeline:true,gain:2});assert(Math.abs(stream.y-before-normal*2)<1e-8);
});
test('plain lyrics advance sequentially without claiming a player timeline and preserve state across partial facts',()=>{
 const {rain}=setup(),plain={status:'plain',plain:'First invented line\n\nSecond invented line'};rain.setLyrics(plain,'one');rain.advance(.1,{});assert.equal(rain.currentText,'First invented line');assert.equal(rain.timed,false);
 for(let i=0;i<51;i++)rain.advance(.1,{});assert.equal(rain.currentText,'Second invented line');const stream=rain.streams[0];rain.setLyrics(plain,'one');assert.equal(rain.streams[0],stream);
});
test('the artwork mask protects bright pixels and permits black cells and letterbox space',()=>{
 const pixels=new Uint8ClampedArray([255,255,255,255,0,0,0,255]);const mask=artworkMask(pixels,2,1,{x:100,y:100,width:200,height:100});assert.equal(mask(140,120,10,14),false);assert.equal(mask(240,120,10,14),true);assert.equal(mask(15,15,10,14),true);assert.equal(mask(195,120,10,14),false);
});
test('drawing never paints protected areas, is bounded and honours reduced motion',()=>{
 const {rain,calls}=setup();rain.setLyrics(lyrics,'one');for(let cue=0;cue<300;cue++)rain.spawn('Original test words');assert(rain.streams.length<=28);for(const stream of rain.streams)stream.y=200;
 rain.setMask(()=>false);rain.draw();assert.equal(calls.length,0);rain.setMask(()=>true);rain.draw({reduced:true});assert.equal(calls.length,0);rain.draw();assert(calls.length>0);assert(calls.every(call=>call[2]>=0&&call[2]<=600));
});
