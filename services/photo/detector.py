"""Local object/context evidence only; no face matching, OCR or external calls."""
from pathlib import Path
import hashlib,io,json,warnings
import cv2,numpy as np
from PIL import Image,ImageOps
cv2.setNumThreads(1)
ROOT=Path(__file__).parent
CATEGORIES={62:'screen',63:'laptop',67:'phone',73:'book'}
MAX_BYTES=4*1024*1024
Image.MAX_IMAGE_PIXELS=2_500_000

def read_frame(raw):
    if not raw or len(raw)>MAX_BYTES:raise ValueError('Invalid analysis image size')
    with warnings.catch_warnings():
        warnings.simplefilter('error',Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>2_500_000 or getattr(image,'n_frames',1)!=1:raise ValueError('Invalid analysis image')
            image=ImageOps.exif_transpose(image).convert('RGB')
            return cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2BGR)

def overlap(a,b):
    x=max(a[0],b[0]);y=max(a[1],b[1]);r=min(a[0]+a[2],b[0]+b[2]);t=min(a[1]+a[3],b[1]+b[3])
    intersection=max(0,r-x)*max(0,t-y)
    return intersection/max(1e-9,a[2]*a[3]+b[2]*b[3]-intersection)

def central(box):
    x,y,w,h=box
    return w*h>=.18 and x<=.5<=x+w and y<=.5<=y+h

def paper_context(frame):
    """A white page-like border is advisory: factory labels can also be white."""
    height,width=frame.shape[:2];scale=min(1,640/max(height,width));small=cv2.resize(frame,(round(width*scale),round(height*scale)))
    gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY);edges=cv2.Canny(gray,60,150)
    contours,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours,key=cv2.contourArea,reverse=True)[:40]:
        polygon=cv2.approxPolyDP(contour,.025*cv2.arcLength(contour,True),True)
        if len(polygon)!=4 or not cv2.isContourConvex(polygon):continue
        ratio=cv2.contourArea(polygon)/(gray.shape[0]*gray.shape[1])
        if not .12<=ratio<=.92:continue
        points=polygon[:,0,:].astype(np.float32);center=points.mean(axis=0)
        # Sample separate corner margins slightly inside the quadrilateral.
        corners=points*.88+center*.12;white=[]
        for px,py in corners:
            x,y=round(float(px)),round(float(py));patch=small[max(0,y-3):y+4,max(0,x-3):x+4].astype(np.int16)
            if not patch.size:break
            white.append(float(np.mean((patch.min(axis=2)>195)&((patch.max(axis=2)-patch.min(axis=2))<35))))
        if len(white)==4 and min(white)>.72:return True
    return False

class Detector:
    def __init__(self,model_path=None):
        self.manifest=json.loads((ROOT/'model.json').read_text());self.model=self.manifest['id'];self.side=self.manifest['inputSize']
        path=Path(model_path) if model_path else ROOT/'models'/self.manifest['file']
        if path.stat().st_size!=self.manifest['size'] or hashlib.sha256(path.read_bytes()).hexdigest()!=self.manifest['sha256']:raise ValueError('Unverified model')
        self.net=cv2.dnn.readNetFromONNX(str(path));grids=[];strides=[]
        for stride in (8,16,32):
            yy,xx=np.meshgrid(np.arange(self.side//stride),np.arange(self.side//stride),indexing='ij');grid=np.stack((xx,yy),axis=-1).reshape(-1,2);grids.append(grid);strides.extend([stride]*len(grid))
        self.grid=np.concatenate(grids);self.strides=np.asarray(strides)[:,None]
        self.predict(np.zeros((self.side,self.side,3),np.uint8))

    def predict(self,frame):
        height,width=frame.shape[:2];scale=min(self.side/height,self.side/width)
        resized=cv2.resize(frame,(max(1,int(width*scale)),max(1,int(height*scale))))
        padded=np.full((self.side,self.side,3),114,np.uint8);padded[:resized.shape[0],:resized.shape[1]]=resized
        # These pinned release assets use raw BGR, NOT ImageNet normalization.
        self.net.setInput(np.ascontiguousarray(padded.transpose(2,0,1)[None],dtype=np.float32));raw=self.net.forward()
        if raw.shape!=(1,len(self.grid),85) or not np.isfinite(raw).all():raise ValueError('Invalid model output')
        pred=raw[0].copy();pred[:,:2]=(pred[:,:2]+self.grid)*self.strides;pred[:,2:4]=np.exp(np.clip(pred[:,2:4],-10,10))*self.strides;pred[:,:4]/=scale
        found=[]
        for cls,kind in CATEGORIES.items():
            scores=pred[:,4]*pred[:,5+cls];selected=np.flatnonzero(scores>=.3)
            boxes=np.concatenate((pred[selected,:2]-pred[selected,2:4]/2,pred[selected,2:4]),axis=1)
            for index in np.asarray(cv2.dnn.NMSBoxes(boxes.tolist(),scores[selected].tolist(),.3,.45)).reshape(-1):
                x,y,w,h=boxes[index];left=max(0.,float(x))/width;top=max(0.,float(y))/height;right=min(float(width),float(x+w))/width;bottom=min(float(height),float(y+h))/height
                if right<=left or bottom<=top:continue
                found.append({'kind':kind,'confidence':float(scores[selected[index]]),'box':[left,top,right-left,bottom-top],'agreement':0.})
        return sorted(found,key=lambda item:item['confidence'],reverse=True)[:20]

    def analyze(self,frame):
        found=self.predict(frame)
        candidates=[item for item in found if item['kind']!='book' and item['confidence']>=.7 and central(item['box'])]
        if candidates:
            mirrored=self.predict(np.ascontiguousarray(frame[:,::-1]))
            for item in candidates:
                for other in mirrored:
                    if item['kind']!=other['kind']:continue
                    x,y,w,h=other['box'];restored=[1-x-w,y,w,h]
                    if overlap(item['box'],restored)>=.6:item['agreement']=max(item['agreement'],other['confidence'])
        return {'model':self.model,'detections':found,'pageLikeBorder':paper_context(frame),'authenticityGuaranteed':False}
