/** Linear-time focus check only; no lighting, print, periodicity or originality scoring. */
export function focusMetrics(data:Uint8Array,width:number,height:number){
 if(data.length!==width*height)throw new Error('Expected grayscale raster');
 let sum=0,squared=0,edges=0,count=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,v=4*data[i]-data[i-1]-data[i+1]-data[i-width]-data[i+width];
  sum+=v;squared+=v*v;count++;if(Math.abs(v)>20)edges++;
 }
 return {laplacianVariance:count?Math.max(0,squared/count-(sum/count)**2):0,edgeFraction:count?edges/count:0};
}
