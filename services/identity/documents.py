"""Local document OCR/face extraction. Owner names are not parsed or retained."""
import io,csv,subprocess,base64,warnings,re
import cv2,numpy as np
from PIL import Image,ImageOps
Image.MAX_IMAGE_PIXELS=16000000

def read_image(raw):
 if not raw or len(raw)>10*1024*1024:raise ValueError('Invalid document size')
 with warnings.catch_warnings():
  warnings.simplefilter('error',Image.DecompressionBombWarning)
  with Image.open(io.BytesIO(raw)) as image:
   if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>16000000:raise ValueError('Invalid document image')
   image=ImageOps.exif_transpose(image).convert('RGB');image.thumbnail((2200,2200));frame=cv2.cvtColor(np.array(image),cv2.COLOR_RGB2BGR)
 if min(frame.shape[:2])<160:raise ValueError('Document too small')
 return frame

def preview(frame):
 h,w=frame.shape[:2];scale=min(1,1400/max(h,w));frame=cv2.resize(frame,(round(w*scale),round(h*scale)))
 return base64.b64encode(cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,85])[1]).decode()

def vehicle_text(raw):
 frame=read_image(raw);h,w=frame.shape[:2]
 if max(h,w)<1800:frame=cv2.resize(frame,None,fx=1800/max(h,w),fy=1800/max(h,w),interpolation=cv2.INTER_CUBIC)
 data=cv2.imencode('.png',frame)[1].tobytes()
 result=subprocess.run(['tesseract','stdin','stdout','-l','rus+kaz+eng','--psm','11','tsv'],input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=25,check=True)
 groups={}
 for row in csv.DictReader(io.StringIO(result.stdout.decode('utf8')),delimiter='\t'):
  word=(row.get('text') or '').strip()
  if not word:continue
  confidence=float(row.get('conf') or '-1')
  if confidence<0:continue
  key=(row.get('block_num'),row.get('par_num'),row.get('line_num'))
  group=groups.setdefault(key,{'words':[],'confidence':[],'boxes':[]});group['words'].append(word);group['confidence'].append(confidence);group['boxes'].append(tuple(int(row[k]) for k in ['left','top','width','height']))
 lines=[]
 translation=str.maketrans('АВСЕНКМОРТХУІ','ABCEHKMOPTXYI')
 pattern=re.compile(r'(?:[ABEKMHOPCTYX]\d{3}[ABEKMHOPCTYX]{2}\d{2,3}|\d{3}[A-Z]{2,3}\d{2}|[A-Z]\d{3}[A-Z]{2,3})')
 for group in groups.values():
  text=' '.join(group['words']);confidence=min(group['confidence']);canonical=re.sub(r'[^A-Z0-9]','',text.upper().translate(translation))
  if pattern.fullmatch(canonical) and confidence>=50:
   left=min(b[0] for b in group['boxes']);top=min(b[1] for b in group['boxes']);right=max(b[0]+b[2] for b in group['boxes']);bottom=max(b[1]+b[3] for b in group['boxes'])
   crop=frame[max(0,top-10):min(frame.shape[0],bottom+10),max(0,left-10):min(frame.shape[1],right+10)]
   gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY);_,binary=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU);confirmed=[]
   for image in [gray,binary]:
    png=cv2.imencode('.png',image)[1].tobytes()
    try:
     refined=subprocess.run(['tesseract','stdin','stdout','-l','eng','--psm','7','-c','tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789','tsv'],input=png,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=6,check=True)
     words=[r for r in csv.DictReader(io.StringIO(refined.stdout.decode('utf8')),delimiter='\t') if r.get('text','').strip() and float(r.get('conf') or '-1')>=0]
     value=''.join(r['text'].strip() for r in words);score=min((float(r['conf']) for r in words),default=-1)
     if value==canonical and score>=85:confirmed.append(score)
    except (subprocess.SubprocessError,ValueError):pass
   if len(confirmed)==2:confidence=max(confidence,min(confirmed));text=canonical
  lines.append({'text':text,'confidence':confidence})
 return {'lines':lines,'reference':preview(frame),'model':'tesseract-local-rus-kaz-eng-v1'}
