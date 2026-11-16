import io,json,threading,unittest,urllib.request,urllib.error
from unittest.mock import patch
import cv2,numpy as np
from PIL import Image
from detector import Detector,read_frame,central,overlap,paper_context
from engine import Handler,ThreadingHTTPServer

class DetectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.detector=Detector()
    def test_pinned_model_loads_and_blank_is_not_a_device(self):
        result=self.detector.analyze(np.full((600,800,3),120,np.uint8))
        self.assertEqual(result['model'],'local-yolox-s-coco-v1');self.assertFalse(result['authenticityGuaranteed']);self.assertEqual(result['detections'],[])
        self.assertEqual(cv2.getNumThreads(),1)
    def test_input_tensor_and_decoding_follow_pinned_weights_contract(self):
        class Net:
            def setInput(self,tensor):self.tensor=tensor
            def forward(self):
                raw=np.zeros((1,8400,85),np.float32);i=20*80+30
                raw[0,i,:4]=[.5,.5,np.log(20),np.log(10)];raw[0,i,4]=1;raw[0,i,72]=.91
                return raw
        d=object.__new__(Detector);d.side=640;d.grid=self.detector.grid;d.strides=self.detector.strides;d.net=Net()
        frame=np.empty((320,640,3),np.uint8);frame[:]=[7,31,241];found=d.predict(frame)
        self.assertEqual(d.net.tensor[0,:,0,0].tolist(),[7,31,241]);self.assertEqual(d.net.tensor[0,:,600,600].tolist(),[114,114,114])
        self.assertEqual(found[0]['kind'],'phone');np.testing.assert_allclose(found[0]['box'],[.25625,.3875,.25,.25],atol=1e-6)
    def test_dominant_device_needs_a_matching_mirrored_view(self):
        d=object.__new__(Detector);d.model='test';original={'kind':'phone','confidence':.92,'box':[.2,.2,.6,.6],'agreement':0.}
        mirrored={'kind':'phone','confidence':.89,'box':[.2,.2,.6,.6],'agreement':0.}
        with patch.object(d,'predict',side_effect=[[original],[mirrored]]):result=d.analyze(np.zeros((300,400,3),np.uint8))
        self.assertEqual(result['detections'][0]['agreement'],.89)
        original={**original,'agreement':0.}
        with patch.object(d,'predict',side_effect=[[original],[{**mirrored,'kind':'screen'}]]):result=d.analyze(np.zeros((300,400,3),np.uint8))
        self.assertEqual(result['detections'][0]['agreement'],0.)
    def test_small_peripheral_device_does_not_trigger_second_view(self):
        d=object.__new__(Detector);d.model='test'
        with patch.object(d,'predict',return_value=[{'kind':'phone','confidence':.99,'box':[0,0,.1,.1],'agreement':0.}]) as predict:d.analyze(np.zeros((300,400,3),np.uint8))
        self.assertEqual(predict.call_count,1)
    def test_page_border_is_advisory_evidence(self):
        frame=np.full((600,800,3),70,np.uint8);cv2.rectangle(frame,(130,50),(670,550),(245,245,245),-1);cv2.rectangle(frame,(220,180),(580,430),(40,40,170),-1)
        self.assertTrue(paper_context(frame));self.assertFalse(paper_context(np.full((600,800,3),220,np.uint8)))
    def test_image_bounds_format_and_orientation(self):
        for raw in [b'',b'not-image',b'x'*(4*1024*1024+1)]:
            with self.assertRaises(Exception):read_frame(raw)
        data=io.BytesIO();image=Image.new('RGB',(40,30));exif=image.getexif();exif[274]=6;image.save(data,format='JPEG',exif=exif)
        self.assertEqual(read_frame(data.getvalue()).shape[:2],(40,30))
        data=io.BytesIO();Image.new('RGB',(2000,2000)).save(data,format='PNG')
        with self.assertRaises(Exception):read_frame(data.getvalue())
    def test_central_and_overlap_geometry(self):
        self.assertTrue(central([.2,.2,.6,.6]));self.assertFalse(central([0,0,.2,.2]));self.assertAlmostEqual(overlap([.2,.2,.6,.6],[.2,.2,.6,.6]),1.)

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Handler.detector=Detector();cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.url='http://127.0.0.1:'+str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_health_and_invalid_requests(self):
        with urllib.request.urlopen(self.url+'/health') as r:self.assertFalse(json.load(r)['externalServices'])
        for path,body,code in [('/unknown',b'x',404),('/analyze',b'',413),('/analyze',b'invalid-image',422)]:
            with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(urllib.request.Request(self.url+path,data=body))
            self.assertEqual(e.exception.code,code)
    def test_real_inference_http_keeps_the_protocol_local_and_does_not_certify_authenticity(self):
        buffer=io.BytesIO();Image.new('RGB',(320,480),(120,120,120)).save(buffer,format='JPEG')
        with urllib.request.urlopen(urllib.request.Request(self.url+'/analyze',data=buffer.getvalue())) as response:result=json.load(response)
        self.assertFalse(result['authenticityGuaranteed']);self.assertEqual(result['detections'],[])
    def test_busy_worker_never_accepts_unbounded_inference(self):
        Handler.lock.acquire()
        try:
            with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(urllib.request.Request(self.url+'/analyze',data=b'image'))
            self.assertEqual(e.exception.code,503)
        finally:Handler.lock.release()

if __name__=='__main__':unittest.main()
