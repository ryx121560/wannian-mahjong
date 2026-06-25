// 模拟 AI对家 拆 tong8 的完整决策链
const fs=require('fs');
const kt=k=>{if('dongnanxibeizhongfabai'.includes(k))return{k,t:'honor',s:k,v:0};const sm={wan:'wan',tong:'tong',tiao:'tiao'},sk=k.slice(0,k.length-1);return{k,t:'num',s:sm[sk],v:parseInt(k.slice(-1))};};

// 对家摸发后14张
const hand14 = 'tong6,tong2,tiao2,tong8,wan9,tiao6,tong8,wan9,zhong,wan8,wan6,wan4,tong3,fa'.split(',').map(kt);
// 手牌分组
function analyzeHand(hand){
  const wan=Array(9).fill(0),tong=Array(9).fill(0),tiao=Array(9).fill(0),winds=[0,0,0,0],dragons=[0,0,0];
  for(const t of hand){if(t.t==='num'){if(t.s==='wan')wan[t.v-1]++;else if(t.s==='tong')tong[t.v-1]++;else tiao[t.v-1]++;}else{const wi={dong:0,nan:1,xi:2,bei:3}[t.s],di={zhong:0,fa:1,bai:2}[t.s];if(wi!==undefined)winds[wi]++;else if(di!==undefined)dragons[di]++;}}
  return {wan,tong,tiao,winds,dragons};
}

// calcShanten
function calcShanten(hand){
  const a=analyzeHand(hand);
  function decNum(cnt,pos,hp,depth){if(depth===undefined)depth=0;if(depth>120){let m=0,t=0;for(let k=pos;k<9;k++)if(cnt[k]>0){m+=Math.floor(cnt[k]/3);cnt[k]%=3;if(cnt[k]>=2)t++;else if(cnt[k]===1&&k+1<9&&cnt[k+1]>0){t++;cnt[k+1]--;}}return[m,t,hp||t>0];}while(pos<9&&cnt[pos]===0)pos++;if(pos>=9)return[0,0,hp];let best=[0,0,false];const score=r=>2*r[0]+r[1]+(r[2]?1:0);const r0=decNum(cnt,pos+1,hp,depth+1);if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;if(cnt[pos]>=3){cnt[pos]-=3;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0]+1,r[1],r[2]])>score(best)||(score([r[0]+1,r[1],r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,r[1],r[2]];cnt[pos]+=3;}if(pos<=6&&cnt[pos]>=1&&cnt[pos+1]>=1&&cnt[pos+2]>=1){cnt[pos]--;cnt[pos+1]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0]+1,r[1],r[2]])>score(best))best=[r[0]+1,r[1],r[2]];cnt[pos]++;cnt[pos+1]++;cnt[pos+2]++;}if(!hp&&cnt[pos]>=2){cnt[pos]-=2;const r=decNum(cnt,pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}if(pos<=7&&cnt[pos]>=1&&cnt[pos+1]>=1){cnt[pos]--;cnt[pos+1]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+1]++;}if(pos<=6&&cnt[pos]>=1&&cnt[pos+2]>=1){cnt[pos]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+2]++;}return best;}
  function decHonor(cnt,n,hp,canSeq){function dfs(pos,hp2,depth){if(depth===undefined)depth=0;if(depth>120){let m=0;for(let k=pos;k<n;k++)if(cnt[k]>=3){m+=Math.floor(cnt[k]/3);cnt[k]%=3;}return[m,0,hp2||cnt.some(c=>c>=2)];}while(pos<n&&cnt[pos]===0)pos++;if(pos>=n)return[0,0,hp2];let best=[0,0,false];const score=r=>2*r[0]+(r[2]?1:0);const r0=dfs(pos+1,hp2,depth+1);if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;if(cnt[pos]>=3){cnt[pos]-=3;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]+=3;}if(!hp2&&cnt[pos]>=2){cnt[pos]-=2;const r=dfs(pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}if(canSeq){for(const[j,k]of canSeq(pos,cnt)){cnt[pos]--;cnt[j]--;cnt[k]--;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]++;cnt[j]++;cnt[k]++;}}return best;}return dfs(0,hp,0);}
  const wr=decHonor(a.winds,4,false,(pos,cnt)=>{const s=[];for(let j=pos+1;j<4;j++)if(cnt[j])for(let k=j+1;k<4;k++)if(cnt[k])s.push([j,k]);return s;});
  const dr=decHonor(a.dragons,3,false,(pos,cnt)=>(pos===0&&cnt[0]&&cnt[1]&&cnt[2])?[[1,2]]:[]);
  if(dr[0]===0){const p=a.dragons.filter(c=>c>0);if(p.length===2&&p.every(c=>c===1))dr[1]=1;else if(p.length>=2&&dr[2]){dr[0]=0;dr[1]=1;dr[2]=false;}}
  if(wr[0]===0){const pw=a.winds.filter(c=>c>0);if(pw.length===2&&pw.every(c=>c===1))wr[1]=1;else if(pw.length>=2&&wr[2]){wr[0]=0;wr[1]=1;wr[2]=false;}}
  const wr2=decNum(a.wan,0,false),tr=decNum(a.tong,0,false),tir=decNum(a.tiao,0,false);
  const parts=[wr,dr,wr2,tr,tir];let bestScore=0;
  for(let i=0;i<parts.length;i++){let melds=0,taatsu=0;for(let j=0;j<parts.length;j++){melds+=parts[j][0];taatsu+=parts[j][1];}taatsu=Math.min(taatsu,4-melds);let total=2*melds+taatsu+(parts[i][2]?1:0);if(total>bestScore)bestScore=total;}
  return Math.max(0,8-bestScore);
}

// calcShanten7Pairs (from ai_engine.js)
function calcShanten7Pairs(hand){
  const cnt={};for(const t of hand){cnt[t.k]=(cnt[t.k]||0)+1;}
  let pairs=0;for(const v of Object.values(cnt))if(v>=2)pairs++;
  return Math.max(0,6-pairs);
}

// ===== 模拟过滤链 =====
console.log('=== AI对家 摸发后14张 ===');
console.log('手牌:', hand14.map(t=>t.k).join(','));

const a14 = analyzeHand(hand14);
const s14 = calcShanten(hand14);
const s7_14 = calcShanten7Pairs(hand14);
console.log('calcShanten:', s14, '(七对:', s7_14, ')');
console.log('万:', a14.wan, '筒:', a14.tong, '条:', a14.tiao, '风:', a14.winds, '箭:', a14.dragons);

// 候选牌过滤
const pairKeys = [];
const cntMap = {};
for(const t of hand14){cntMap[t.k]=(cntMap[t.k]||0)+1;}
for(const [k,v] of Object.entries(cntMap)){if(v>=2)pairKeys.push(k);}
console.log('\n对子:', pairKeys);

// 找雀头
function findBestPairs(hand){
  const c={};for(const t of hand)c[t.k]=(c[t.k]||0)+1;
  const pairs=[];for(const [k,v] of Object.entries(c))if(v>=2)pairs.push(k);
  return pairs;
}

const pairs = findBestPairs(hand14);
console.log('雀头候选:', pairs);

// breaksMeld: 检查拆某牌是否破坏刻子/顺子
function breaksMeld(tile,hand){
  const idx=hand.findIndex(t=>t.k===tile.k);
  if(idx<0)return false;
  const test=hand.filter((_,i)=>i!==idx);
  const a=analyzeHand(test);
  // Check if any complete meld was broken
  // 简化: 检查万筒条的刻子和顺子
  for(const s of [a.wan,a.tong,a.tiao]){
    for(let i=0;i<9;i++){
      if(s[i]>=3)return true; // 刻子
      if(i<=6&&s[i]>=1&&s[i+1]>=1&&s[i+2]>=1)return true; // 顺子
    }
  }
  return false;
}

// breaksPair: 拆对子时是否只剩这一个对子
function breaksPair(tile,handPairs){
  if(!handPairs||handPairs.length===0)return false;
  const pair=handPairs.find(p=>p===tile.k);
  if(!pair)return false;
  return handPairs.length<=1;
}

// isolatedScore (简化版)
function isolatedScore(tile,hand){
  const a=analyzeHand(hand);
  let score=0;
  if(tile.t==='honor'){
    if(['dong','nan','xi','bei'].includes(tile.s)){
      const wi={dong:0,nan:1,xi:2,bei:3};
      const cnt=a.winds;
      const myIdx=wi[tile.s];
      const diffWinds=cnt.filter((c,i)=>i!==myIdx&&c>0).length;
      if(diffWinds>0)score+=Math.min(diffWinds,1);
    }
    if(['zhong','fa','bai'].includes(tile.s)){
      const di={zhong:0,fa:1,bai:2};
      const cnt=a.dragons;
      const myIdx=di[tile.s];
      const diffDragons=cnt.filter((c,i)=>i!==myIdx&&c>0).length;
      if(diffDragons>0)score+=Math.min(diffDragons,1);
    }
  }else{
    const arr=tile.s==='wan'?a.wan:tile.s==='tong'?a.tong:a.tiao;
    const v=tile.v-1;
    // 邻接
    if(v>0&&arr[v-1]>0)score+=arr[v-1]*2;
    if(v<8&&arr[v+1]>0)score+=arr[v+1]*2;
    if(v>1&&arr[v-2]>0)score+=arr[v-2];
    if(v<7&&arr[v+2]>0)score+=arr[v+2];
  }
  return score;
}

// 候选牌: 所有不同类型（去重后）
const uniqueKeys = [...new Set(hand14.map(t=>t.k))];
console.log('\n候选牌及其 isolatedScore:');
for(const k of uniqueKeys){
  const tile=kt(k);
  const s=isolatedScore(tile,hand14);
  const isPair=pairs.includes(k);
  const bp=isPair?breaksPair(tile,pairs):false;
  console.log(`  ${k.padEnd(7)} isolatedScore=${s}${isPair?' pair':''}${bp?' BREAKS_PAIR':''}`);
}

// 模拟弃牌后 shanten
console.log('\n各弃牌后的 shanten:');
for(const k of uniqueKeys){
  const idx=hand14.findIndex(t=>t.k===k);
  const testHand=hand14.filter((_,i)=>i!==idx);
  const s=calcShanten(testHand);
  console.log(`  弃${k.padEnd(7)} → shanten=${s}`);
}