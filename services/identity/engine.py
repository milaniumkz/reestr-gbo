"""Private CPU-only face verification. No outbound requests at runtime.

Active randomized challenge + two local PAD models + one-face continuity.
These checks reduce presentation/replay attacks; they do not guarantee detection
of every deepfake. Borderline quality/PAD results require human review.
"""
import base64,hashlib,json,os,threading,time,tempfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import cv2,numpy as np,mediapipe as mp
from vendor.generate_patches import CropImage
from documents import read_image,preview,vehicle_text
cv2.setNumThreads(1)
ROOT=Path(__file__).parent/'models'
MODEL='intercity-sface-yunet-minifas2-mesh-v1'
LOCK=threading.Lock()
for manifest in ['opencv-models.json','pad-manifest.json']:
 for item in json.loads((ROOT/manifest).read_text()):
  if hashlib.sha256((ROOT/item['file']).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Model checksum mismatch')
DETECTOR=cv2.FaceDetectorYN.create(str(ROOT/'face_detection_yunet_2023mar.onnx'),'',(640,480),.90,.3,5000)
RECOGNIZER=cv2.FaceRecognizerSF.create(str(ROOT/'face_recognition_sface_2021dec.onnx'),'')
PAD=[(cv2.dnn.readNetFromONNX(str(ROOT/name)),scale) for name,scale in [('2.7_80x80_MiniFASNetV2.onnx',2.7),('4_0_0_80x80_MiniFASNetV1SE.onnx',4.0)]]
CROPPER=CropImage()
ACTIONS={'TURN_LEFT','TURN_RIGHT','LOOK_UP','OPEN_MOUTH','BLINK'}

def detect(frame,max_side=640):
 h,w=frame.shape[:2];scale=min(1,max_side/max(w,h));small=cv2.resize(frame,(round(w*scale),round(h*scale)))
 DETECTOR.setInputSize((small.shape[1],small.shape[0]));_,faces=DETECTOR.detect(small)
 if faces is None or len(faces)!=1:return None
 face=faces[0].copy();face[:14]/=scale
 return face

def vector(frame,face):
 v=RECOGNIZER.feature(RECOGNIZER.alignCrop(frame,face)).flatten().astype(float);n=np.linalg.norm(v)
 if v.shape!=(128,) or not np.isfinite(v).all() or n<=0:raise ValueError('Invalid face vector')
 return v/n

def pad(frame,face):
 scores=[]
 for model,scale in PAD:
  patch=CROPPER.crop(frame,face[:4].tolist(),scale,80,80)
  # Upstream uses BGR float values 0..255, WITHOUT /255 normalization.
  model.setInput(cv2.dnn.blobFromImage(patch,1.0,(80,80),swapRB=False,crop=False))
  logits=model.forward().flatten();prob=np.exp(logits-np.max(logits));prob/=prob.sum();scores.append(float(prob[1]))
 return scores

def pose(points):
 p=np.array([(x.x,x.y) for x in points]);eyes=np.linalg.norm(p[33]-p[263]);center=(p[33]+p[263])/2
 if eyes<.025:raise ValueError('Face too small')
 eye=lambda a,b,c,d:np.linalg.norm(p[a]-p[b])/max(.001,np.linalg.norm(p[c]-p[d]))
 return {'yaw':float((p[1,0]-center[0])/eyes),'pitch':float((p[1,1]-center[1])/eyes),
  'mouth':float(np.linalg.norm(p[13]-p[14])/max(.001,np.linalg.norm(p[61]-p[291]))),
  'eye':float((eye(159,145,33,133)+eye(386,374,362,263))/2)}

def sustained(samples,predicate):
 consecutive=0
 for sample in samples:
  consecutive=consecutive+1 if predicate(sample) else 0
  if consecutive>=2:return True
 return False

def action_passed(action,samples,baseline):
 if len(samples)<6:return False
 if action=='TURN_LEFT':return sustained(samples,lambda p:p['yaw']-baseline['yaw']>.09)
 if action=='TURN_RIGHT':return sustained(samples,lambda p:p['yaw']-baseline['yaw']<-.09)
 if action=='LOOK_UP':return sustained(samples,lambda p:p['pitch']-baseline['pitch']<-.045)
 if action=='OPEN_MOUTH':return sustained(samples,lambda p:p['mouth']>max(.16,baseline['mouth']+.07))
 if action=='BLINK':
  closed=False;blinks=0
  for p in samples:
   if p['eye']<baseline['eye']*.72:closed=True
   elif closed and p['eye']>baseline['eye']*.85:blinks+=1;closed=False
  return blinks>=1
 return False

def reject(reason):return {'verdict':'REJECT','reason':reason,'model':MODEL}

def verify(path,actions):
 if len(actions) not in (2,3) or len(set(actions))!=len(actions) or not set(actions)<=ACTIONS:return reject('Некорректное задание')
 enrollment=len(actions)==2;expected_duration=2+6*len(actions)
 capture=cv2.VideoCapture(str(path))
 if not capture.isOpened():return reject('Не удалось прочитать видео с камеры')
 fps=capture.get(cv2.CAP_PROP_FPS);count=capture.get(cv2.CAP_PROP_FRAME_COUNT)
 # Browser MediaRecorder WebM often has no duration/frame-count header.
 # Validate decoded timestamps, never trust a missing container duration.
 valid_fps=5<=fps<=65
 first_stamp=None;last_frame_time=0;last_delta=.033;fingerprints=[];last_fingerprint=-1
 poses=[[] for _ in actions];neutral=[];vectors=[];neutral_vectors=[];scores=[];sharpness=[];reference=None;seen=0;missing=0;last=-1;last_vector=-1;last_pad=-1;started=time.monotonic()
 try:
  with mp.solutions.face_mesh.FaceMesh(static_image_mode=False,max_num_faces=2,refine_landmarks=False,min_detection_confidence=.7,min_tracking_confidence=.7) as mesh:
   index=0
   while True:
    ok,frame=capture.read()
    if not ok:break
    stamp=capture.get(cv2.CAP_PROP_POS_MSEC)/1000
    if first_stamp is None:first_stamp=stamp
    t=stamp-first_stamp
    if t<=0 and index>0:
     if not valid_fps:return reject('Не удалось прочитать время записи')
     t=index/fps
    if t<last_frame_time-.05 or t>24.5:return reject('Некорректное время записи')
    if index>0:last_delta=t-last_frame_time
    last_frame_time=t;index+=1
    if t-last_fingerprint>=expected_duration/40 and len(fingerprints)<40:
     tiny=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(9,8));bits=(tiny[:,1:]>tiny[:,:-1]).flatten();value=0
     for bit in bits:value=(value<<1)|int(bit)
     fingerprints.append(f'{value:016x}');last_fingerprint=t
    if time.monotonic()-started>70:return reject('Обработка прервана. Повторите запись')
    if index>1600 or frame.shape[0]*frame.shape[1]>2100000:return reject('Запишите видео в обычном качестве, до 1280×720')
    sample_tick=int(t*30+1e-6)
    if sample_tick<=last:continue
    last=sample_tick;seen+=1
    face=detect(frame,512)
    if face is None or min(face[2:4])<90:missing+=1;continue
    # Landmark coordinates are normalized: keep their input bounded while
    # retaining full-resolution pixels for identity, PAD and stored reference.
    mh,mw=frame.shape[:2];ms=min(1,640/max(mw,mh))
    motion_frame=cv2.resize(frame,(round(mw*ms),round(mh*ms))) if ms<1 else frame
    result=mesh.process(cv2.cvtColor(motion_frame,cv2.COLOR_BGR2RGB))
    if not result.multi_face_landmarks:missing+=1;continue
    if len(result.multi_face_landmarks)!=1:return reject('В кадре должно быть только одно лицо')
    p=pose(result.multi_face_landmarks[0].landmark)
    if t<2:neutral.append(p)
    else:
     for phase in range(len(actions)):
      if 2+phase*6-.20<=t<=2+phase*6+4.65:poses[phase].append(p)
    neutral_phase=t<2 or (t>=2 and (t-2)%6>=4)
    if t-last_vector>=.35:
     last_vector=t
     v=vector(frame,face);vectors.append(v)
     if neutral_phase and abs(p['yaw'])<.18:neutral_vectors.append(v)
     if len(vectors)>1 and float(v@vectors[0])<.45:return reject('Лицо изменилось во время записи. Повторите проверку')
    # PAD models are trained on frontal faces; head-turn frames must not
    # be mistaken for a photo attack. All active tasks are still mandatory.
    neutral_phase=t<2 or (t>=2 and (t-2)%6>=4)
    if t-last_pad>=.30 and neutral_phase and abs(p['yaw'])<.18:
     last_pad=t
     scores.append(pad(frame,face))
     x,y,w,h=map(int,face[:4]);crop=frame[max(0,y):max(0,y)+h,max(0,x):max(0,x)+w]
     if crop.size:sharpness.append(float(cv2.Laplacian(cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY),cv2.CV_64F).var()))
    if reference is None and t<2:
     # Retain only an aligned reference, not a full frame of the surroundings.
     x,y,w,h=face[:4];left=max(0,int(x-w*.1));top=max(0,int(y-h*.1));right=min(frame.shape[1],int(x+w*1.1));bottom=min(frame.shape[0],int(y+h*1.1));portrait=frame[top:bottom,left:right]
     scale=min(1,512/max(portrait.shape[:2]));portrait=cv2.resize(portrait,(round(portrait.shape[1]*scale),round(portrait.shape[0]*scale)))
     reference=cv2.imencode('.jpg',portrait,[cv2.IMWRITE_JPEG_QUALITY,92])[1].tobytes()
 finally:capture.release()
 duration=last_frame_time+(1/fps if valid_fps else max(.01,min(.2,last_delta)))
 if not expected_duration-1<=duration<=expected_duration+4:return reject('Запишите полное видео с выполнением всех заданий')
 if seen<max(45,int(expected_duration*4.5)):return reject('Камера записала слишком мало кадров. Закройте другие приложения и повторите запись')
 if missing>seen*(.25 if enrollment else .15) or reference is None:return reject('Лицо часто пропадает из кадра или слишком далеко. Держите лицо целиком в овале и направьте свет на лицо')
 if len(neutral)<10:return reject('В начале записи смотрите прямо в камеру и держите лицо неподвижно')
 if len(vectors)<(18 if enrollment else 25):return reject('Недостаточно чётких кадров лица. Держите телефон устойчиво и повторите запись')
 if len(scores)<10:return reject('Недостаточно кадров с лицом прямо в камеру. После каждого движения снова смотрите прямо')
 baseline={k:float(np.median([p[k] for p in neutral])) for k in neutral[0]}
 if baseline['mouth']>.40 or baseline['eye']<.09:return reject('В начале смотрите прямо в камеру, с открытыми глазами и закрытым ртом')
 actions_ok=[action_passed(a,s,baseline) for a,s in zip(actions,poses)]
 if not any(actions_ok):return reject('Не все задания выполнены. Запишите новое видео по подсказкам')
 values=np.array(scores);medians=np.median(values,axis=0);lower=np.quantile(values,.20,axis=0)
 if min(medians)<.50 or min(lower)<.15:return reject('Проверка подлинности видео не пройдена. Снимите себя вживую без экранов и фотографий')
 averaged=np.mean(neutral_vectors if len(neutral_vectors)>=6 else vectors,axis=0);averaged/=np.linalg.norm(averaged)
 continuity=min(float(v@averaged) for v in vectors)
 problems=[];issues=[]
 names={'TURN_LEFT':'поворот головы налево','TURN_RIGHT':'поворот головы направо','LOOK_UP':'поднять подбородок','OPEN_MOUTH':'открыть рот','BLINK':'моргание'}
 if not all(actions_ok):issues.append('ACTIONS');problems.append('Не распознаны задания: '+', '.join(names[a] for a,ok in zip(actions,actions_ok) if not ok))
 if min(medians)<(.85 if enrollment else .97) or min(lower)<(.50 if enrollment else .85):issues.append('PAD');problems.append('Не удалось уверенно подтвердить живое лицо: уберите блики, направьте свет на лицо')
 if np.median(sharpness)<(25 if enrollment else 35):issues.append('SHARPNESS');problems.append('Изображение размыто: протрите камеру и держите телефон неподвижно')
 if continuity<(.55 if enrollment else .60):issues.append('CONTINUITY');problems.append('Лицо теряется при движении: поворачивайте голову плавно')
 uncertain=bool(problems)
 return {'verdict':'REVIEW' if uncertain else 'PASS','reason':'. '.join(problems), 'model':MODEL,
  'videoSignature':fingerprints,'embedding':averaged.tolist(),'reference':base64.b64encode(reference).decode(),
  'checks':{'issues':issues,'passedActions':sum(actions_ok),'totalActions':len(actions),'activeChallenge':all(actions_ok),'oneFace':True,'sharpness':round(float(np.median(sharpness)),3),'padLower':[round(float(x),3) for x in lower],'continuity':round(continuity,3),'padMedian':[round(float(x),3) for x in medians]}}

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def reply(self,code,obj):
  body=json.dumps(obj,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):self.reply(200 if self.path=='/health' else 404,{'ready':True,'liveness':True,'model':MODEL,'externalServices':False})
 def do_POST(self):
  if self.path not in ('/verify','/document-face','/vehicle-text'):return self.reply(404,{})
  self.connection.settimeout(30)
  try:size=int(self.headers.get('Content-Length','0'))
  except ValueError:return self.reply(400,{})
  minimum=10000 if self.path=='/verify' else 100
  maximum=16*1024*1024 if self.path=='/verify' else 10*1024*1024
  if size<minimum or size>maximum:return self.reply(413,{})
  if not LOCK.acquire(blocking=False):return self.reply(503,{'error':'busy'})
  try:
   data=self.rfile.read(size)
   if len(data)!=size:return self.reply(400,{})
   if self.path=='/vehicle-text': result=vehicle_text(data)
   elif self.path=='/document-face':
    frame=read_image(data);face=detect(frame);result={'model':MODEL,'reference':preview(frame)}
    if face is not None:
     result.update({'embedding':vector(frame,face).tolist(),'quality':min(face[2:4])>=80})
   else:
    with tempfile.NamedTemporaryFile(suffix='.video',dir='/tmp') as file:
     file.write(data);file.flush();result=verify(file.name,self.headers.get('X-Identity-Actions','').split(','))
   self.reply(200,result)
  except Exception:self.reply(200,reject('Не удалось обработать запись. Запишите новое видео'))
  finally:LOCK.release()
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
