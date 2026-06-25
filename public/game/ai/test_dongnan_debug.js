// 详细追踪 calcShanten 各花色分解
const fs = require('fs');

function kt(k){
  if('dongnanxibeizhongfabai'.includes(k))return{k,t:'honor',s:k,v:0};
  const sm={wan:'wan',tong:'tong',tiao:'tiao'};
  const sk=k.slice(0,k.length-1);
  return{k,t:'num',s:sm[sk],v:parseInt(k.slice(-1))};
}

function calcShantenDebug(hand){
  const wan=Array(9).fill(0),tong=Array(9).fill(0),tiao=Array(9).fill(0);
  const winds=[0,0,0,0],dragons=[0,0,0];
  for(const t of hand){
    if(t.t==='num'){
      if(t.s==='wan')wan[t.v-1]++;else if(t.s==='tong')tong[t.v-1]++;else tiao[t.v-1]++;
    }else{
      const wi={dong:0,nan:1,xi:2,bei:3}[t.s],di={zhong:0,fa:1,bai:2}[t.s];
      if(wi!==undefined)winds[wi]++;else if(di!==undefined)dragons[di]++;
    }
  }
  function decNum(cnt,pos,hp,depth){
    if(depth===undefined)depth=0;
    if(depth>120){let m=0,t=0;for(let k=pos;k<9;k++)if(cnt[k]>0){m+=Math.floor(cnt[k]/3);cnt[k]%=3;if(cnt[k]>=2)t++;else if(cnt[k]===1&&k+1<9&&cnt[k+1]>0){t++;cnt[k+1]--;}}return[m,t,hp||t>0];}
    while(pos<9&&cnt[pos]===0)pos++;
    if(pos>=9)return[0,0,hp];
    let best=[0,0,false];const score=r=>2*r[0]+r[1]+(r[2]?1:0);
    const r0=decNum(cnt,pos+1,hp,depth+1);if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;
    if(cnt[pos]>=3){cnt[pos]-=3;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0]+1,r[1],r[2]])>score(best)||(score([r[0]+1,r[1],r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,r[1],r[2]];cnt[pos]+=3;}
    if(pos<=6&&cnt[pos]>=1&&cnt[pos+1]>=1&&cnt[pos+2]>=1){
      cnt[pos]--;cnt[pos+1]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);
      if(score([r[0]+1,r[1],r[2]])>score(best))best=[r[0]+1,r[1],r[2]];cnt[pos]++;cnt[pos+1]++;cnt[pos+2]++;
    }
    if(!hp&&cnt[pos]>=2){cnt[pos]-=2;const r=decNum(cnt,pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}
    if(pos<=7&&cnt[pos]>=1&&cnt[pos+1]>=1){
      cnt[pos]--;cnt[pos+1]--;const r=decNum(cnt,pos,hp,depth+1);
      if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+1]++;
    }
    if(pos<=6&&cnt[pos]>=1&&cnt[pos+2]>=1){
      cnt[pos]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);
      if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+2]++;
    }
    return best;
  }
  function decHonor(cnt,n,hp,canSeq){
    function dfs(pos,hp2,depth){
      if(depth===undefined)depth=0;
      if(depth>120){let m=0;for(let k=pos;k<n;k++)if(cnt[k]>=3){m+=Math.floor(cnt[k]/3);cnt[k]%=3;}return[m,0,hp2||cnt.some(c=>c>=2)];}
      while(pos<n&&cnt[pos]===0)pos++;
      if(pos>=n)return[0,0,hp2];
      let best=[0,0,false];const score=r=>2*r[0]+(r[2]?1:0);
      const r0=dfs(pos+1,hp2,depth+1);if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;
      if(cnt[pos]>=3){cnt[pos]-=3;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]+=3;}
      if(!hp2&&cnt[pos]>=2){cnt[pos]-=2;const r=dfs(pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}
      if(canSeq){for(const[j,k]of canSeq(pos,cnt)){cnt[pos]--;cnt[j]--;cnt[k]--;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]++;cnt[j]++;cnt[k]++;}}
      return best;
    }
    return dfs(0,hp,0);
  }
  const wr=decHonor(winds,4,false,(pos,cnt)=>{const s=[];for(let j=pos+1;j<4;j++)if(cnt[j])for(let k=j+1;k<4;k++)if(cnt[k])s.push([j,k]);return s;});
  const dr=decHonor(dragons,3,false,(pos,cnt)=>(pos===0&&cnt[0]&&cnt[1]&&cnt[2])?[[1,2]]:[]);
  if(dr[0]===0){const p=dragons.filter(c=>c>0);if(p.length===2&&p.every(c=>c===1))dr[1]=1;else if(p.length>=2&&dr[2]){dr[0]=0;dr[1]=1;dr[2]=false;}}
  if(wr[0]===0){const pw=winds.filter(c=>c>0);if(pw.length===2&&pw.every(c=>c===1))wr[1]=1;else if(pw.length>=2&&wr[2]){wr[0]=0;wr[1]=1;wr[2]=false;}}
  
  console.log('winds:', winds, '→ wr:', wr);
  console.log('dragons:', dragons, '→ dr:', dr);
  
  const wr2=decNum(wan,0,false);
  console.log('wan:', wan, '→ wr2:', wr2);
  const tr=decNum(tong,0,false);
  console.log('tong:', tong, '→ tr:', tr);
  const tir=decNum(tiao,0,false);
  console.log('tiao:', tiao, '→ tir:', tir);
  
  const parts=[wr,dr,wr2,tr,tir];
  let bestScore=0;
  for(let i=0;i<parts.length;i++){
    let melds=0,taatsu=0;
    for(let j=0;j<parts.length;j++){melds+=parts[j][0];taatsu+=parts[j][1];}
    taatsu=Math.min(taatsu,4-melds);
    let total=2*melds+taatsu+(parts[i][2]?1:0);
    console.log(`  i=${i} part=${parts[i].join(',')}: melds=${melds} taatsu=${taatsu} hasPair=${parts[i][2]} total=${total}`);
    if(total>bestScore)bestScore=total;
  }
  return Math.max(0,8-bestScore);
}

const h1='tong7,nan,wan4,zhong,tiao4,tiao2,dong,tong7,wan2,tong8,tiao4,wan4,tiao2,tiao9'.split(',').map(kt);
console.log('=== 详细分解 ===');
console.log('手牌:', h1.map(t=>t.k).join(','), `(${h1.length}张)`);
console.log('calcShanten:', calcShantenDebug(h1));
console.log('七对  :', (()=>{const cnt={};for(const t of h1)cnt[t.k]=(cnt[t.k]||0)+1;let p=0;for(const v of Object.values(cnt))if(v>=2)p++;return Math.max(0,6-p);})());