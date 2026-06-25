// 测试修复后的 calcShanten
const fs = require('fs');

function teq(a,b){return a.k===b.k;}
function tkey(t){return t.k;}
function kt(k){
  if('dongnanxibeizhongfabai'.includes(k))return{k,t:'honor',s:k,v:0};
  const sm={wan:'wan',tong:'tong',tiao:'tiao'};
  const sk=k.slice(0,k.length-1);
  return{k,t:'num',s:sm[sk],v:parseInt(k.slice(-1))};
}

// 修复版 calcShanten
function calcShantenFixed(hand){
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
  // 箭牌后处理
  if(dr[0]===0){const p=dragons.filter(c=>c>0);if(p.length===2&&p.every(c=>c===1))dr[1]=1;else if(p.length>=2&&dr[2]){dr[0]=0;dr[1]=1;dr[2]=false;}}
  // 风牌后处理（新增）
  if(wr[0]===0){
    const pw=winds.filter(c=>c>0);
    if(pw.length===2&&pw.every(c=>c===1)){wr[1]=1;}
    else if(pw.length>=2&&wr[2]){wr[0]=0;wr[1]=1;wr[2]=false;}
  }
  const wr2=decNum(wan,0,false),tr=decNum(tong,0,false),tir=decNum(tiao,0,false);
  const parts=[wr,dr,wr2,tr,tir];
  let bestScore=0;
  for(let i=0;i<parts.length;i++){
    let melds=0,taatsu=0;
    for(let j=0;j<parts.length;j++){melds+=parts[j][0];taatsu+=parts[j][1];}
    taatsu=Math.min(taatsu,4-melds);
    let total=2*melds+taatsu+(parts[i][2]?1:0);
    if(total>bestScore)bestScore=total;
  }
  return Math.max(0,8-bestScore);
}

function calcShanten7Pairs(hand){
  const cnt={};
  for(const t of hand){const k=t.k;cnt[k]=(cnt[k]||0)+1;}
  let pairs=0;
  for(const v of Object.values(cnt)){if(v>=2)pairs++;}
  return Math.max(0,6-pairs);
}

// 测试用例
console.log('=== turn1 摸9条后 (东+南+zhong) ===');
const h1='tong7,nan,wan4,zhong,tiao4,tiao2,dong,tong7,wan2,tong8,tiao4,wan4,tiao2,tiao9'.split(',').map(kt);
console.log('修复前:', 5); // confirmed
console.log('修复后 calcShanten:', calcShantenFixed(h1));
console.log('七对:', calcShanten7Pairs(h1));
// 预期: 修复后面子手向听数应 < 5，至少等于或接近七对

console.log('\n=== turn3 摸9万后 (东+南+zhong) ===');
const h2='tong7,nan,wan4,zhong,tiao4,tiao2,dong,tong7,wan2,tong8,tiao4,wan4,tiao2,wan9'.split(',').map(kt);
console.log('修复后 calcShanten:', calcShantenFixed(h2));
console.log('七对:', calcShanten7Pairs(h2));

// 验证 wr 内部值
console.log('\n=== 验证 wr ===');
function wrDebug(hand){
  const winds=[0,0,0,0];
  for(const t of hand)if(t.t==='honor'&&['dong','nan','xi','bei'].includes(t.s))winds[{dong:0,nan:1,xi:2,bei:3}[t.s]]++;
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
  console.log('wind counts:', winds);
  console.log('wr from decHonor:', wr);
  // 模拟修复
  if(wr[0]===0){
    const pw=winds.filter(c=>c>0);
    console.log('non-zero winds:', pw);
    if(pw.length===2&&pw.every(c=>c===1)){wr[1]=1;console.log('→ taatsu fix applied');}
  }
  console.log('wr after fix:', wr);
}
wrDebug(h1);

// 更多边界测试
console.log('\n=== 边界测试 ===');
console.log('东东东南(3同+1异) [3,1,0,0]:');
const h3='dong,dong,dong,nan'.split(',').map(kt);
console.log('calcShanten:', calcShantenFixed(h3), '(应=0，刻子完成)');

console.log('\n东南西北 [1,1,1,1]:');
const h4='dong,nan,xi,bei'.split(',').map(kt);
console.log('calcShanten:', calcShantenFixed(h4), '(应=0-1，3风成顺+1孤张)');

console.log('\n东东南南 [2,2,0,0]:');
const h5='dong,dong,nan,nan'.split(',').map(kt);
console.log('calcShanten:', calcShantenFixed(h5));