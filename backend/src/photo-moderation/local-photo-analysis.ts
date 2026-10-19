/** Screening signals are not proof of document authenticity. */
export type LocalImageMetrics={mean:number;contrast:number;laplacianVariance:number;edgeFraction:number;periodicRows:boolean;periodicColumns:boolean;darkFrame:boolean};
function periodic(profile:number[]) {
  const n=profile.length,mean=profile.reduce((a,b)=>a+b,0)/n,variance=profile.reduce((a,b)=>a+(b-mean)**2,0)/n;
  if(variance<64)return false;
  // Sparse dark text/rules have high kurtosis; do not confuse them with broad screen bands.
  if(profile.reduce((a,b)=>a+(b-mean)**4,0)/n/(variance*variance)>3)return false;
  let strongest=0;
  // Exclude broad lighting gradients; require at least four repeating bands.
  for(let k=4;k<=Math.min(64,Math.floor(n/4));k++) {
    let re=0,im=0;
    for(let i=0;i<n;i++){const phase=2*Math.PI*k*i/n;re+=(profile[i]-mean)*Math.cos(phase);im+=(profile[i]-mean)*Math.sin(phase);}
    strongest=Math.max(strongest,2*(re*re+im*im)/(n*n*variance));
  }
  return strongest>.55;
}
export function analyzePixels(gray:Uint8Array,width:number,height:number):LocalImageMetrics {
  if(width<3||height<3||gray.length!==width*height)throw new Error('Invalid grayscale raster');
  let sum=0,sum2=0,lap=0,lap2=0,edges=0,count=0,borderDark=0,borderCount=0,centerBright=0,centerCount=0;
  const rows=Array<number>(height).fill(0),columns=Array<number>(width).fill(0);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,v=gray[i];sum+=v;sum2+=v*v;rows[y]+=v/width;columns[x]+=v/height;
    if(x<width*.04||x>=width*.96||y<height*.04||y>=height*.96){borderCount++;if(v<45)borderDark++;}
    if(x>width*.2&&x<width*.8&&y>height*.2&&y<height*.8){centerCount++;if(v>120)centerBright++;}
    if(x===0||y===0||x===width-1||y===height-1)continue;
    const l=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*v;lap+=l;lap2+=l*l;count++;
    if(Math.abs(gray[i+1]-gray[i-1])+Math.abs(gray[i+width]-gray[i-width])>40)edges++;
  }
  const mean=sum/gray.length;
  return {mean,contrast:Math.sqrt(Math.max(0,sum2/gray.length-mean*mean)),laplacianVariance:Math.max(0,lap2/count-(lap/count)**2),edgeFraction:edges/count,periodicRows:periodic(rows),periodicColumns:periodic(columns),darkFrame:borderDark/borderCount>.8&&centerBright/centerCount>.75};
}
export function reviewReasons(m:LocalImageMetrics):string[]{
  const reasons:string[]=[];
  if(m.periodicRows||m.periodicColumns)reasons.push('Повторяющиеся полосы: возможна пересъёмка экрана');
  if(m.darkFrame)reasons.push('Тёмная рамка вокруг изображения: проверьте, не снят ли экран');
  if(m.mean<35)reasons.push('Слишком тёмное изображение');
  if(m.contrast<12)reasons.push('Низкий контраст: проверьте читаемость документа');
  if(m.laplacianVariance<18&&m.edgeFraction<.015)reasons.push('Возможное размытие или недостаток деталей');
  return reasons;
}
