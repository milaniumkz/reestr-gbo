import unittest,tempfile
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import numpy as np,cv2
import engine
from documents import read_image
class IdentityEngineTests(unittest.TestCase):
 def test_invalid_video_and_actions_never_pass(self):
  self.assertEqual(engine.verify('/missing',['TURN_LEFT'] )['verdict'],'REJECT')
  self.assertEqual(engine.verify('/missing',['TURN_LEFT','TURN_LEFT','BLINK'])['verdict'],'REJECT')
 def test_black_video_is_not_a_live_person(self):
  with tempfile.TemporaryDirectory() as root:
   path=Path(root)/'blank.mp4';writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),10,(640,480))
   for _ in range(200):writer.write(np.zeros((480,640,3),dtype=np.uint8))
   writer.release();self.assertEqual(engine.verify(path,['TURN_LEFT','OPEN_MOUTH','BLINK'])['verdict'],'REJECT')
 def test_active_challenge_requires_sequence_and_actual_changes(self):
  baseline={'yaw':0,'pitch':.4,'eye':.25,'mouth':0}
  static=[dict(baseline) for _ in range(40)]
  for action in engine.ACTIONS:self.assertFalse(engine.action_passed(action,static,baseline))
  self.assertTrue(engine.action_passed('TURN_LEFT',[{**baseline,'yaw':.2} for _ in range(40)],baseline))
  self.assertFalse(engine.action_passed('TURN_RIGHT',[{**baseline,'yaw':.2} for _ in range(40)],baseline))
  blinking=[dict(baseline) for _ in range(40)]
  for n in [10,11,25,26]:blinking[n]['eye']=.1
  self.assertTrue(engine.action_passed('BLINK',blinking,baseline))
 def test_short_small_movements_are_recognized_without_accepting_static_or_single_frame_noise(self):
  baseline={'yaw':0,'pitch':.4,'eye':.25,'mouth':.03}
  for action,key,value in [('OPEN_MOUTH','mouth',.19),('LOOK_UP','pitch',.34),('TURN_LEFT','yaw',.11),('TURN_RIGHT','yaw',-.11)]:
   samples=[dict(baseline) for _ in range(40)]
   samples[18][key]=value
   self.assertFalse(engine.action_passed(action,samples,baseline))
   samples[19][key]=value
   self.assertTrue(engine.action_passed(action,samples,baseline))
  open_baseline={**baseline,'mouth':.18}
  self.assertFalse(engine.action_passed('OPEN_MOUTH',[dict(open_baseline) for _ in range(40)],open_baseline))
 def test_two_task_enrollment_still_rejects_a_blank_recording(self):
  with tempfile.TemporaryDirectory() as root:
   path=Path(root)/'short.mp4';writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),20,(640,480))
   for _ in range(280):writer.write(np.zeros((480,640,3),dtype=np.uint8))
   writer.release();self.assertEqual(engine.verify(path,['OPEN_MOUTH','LOOK_UP'])['verdict'],'REJECT')
 def test_one_natural_blink_is_enough_but_static_eyes_or_unfinished_closure_are_not(self):
  baseline={'yaw':0,'pitch':.4,'eye':.25,'mouth':.03}
  samples=[dict(baseline) for _ in range(40)]
  samples[18]['eye']=.16;samples[19]['eye']=.16
  self.assertTrue(engine.action_passed('BLINK',samples,baseline))
  self.assertFalse(engine.action_passed('BLINK',[dict(baseline) for _ in range(40)],baseline))
  unfinished=[dict(baseline) for _ in range(40)]
  for n in range(18,40):unfinished[n]['eye']=.16
  self.assertFalse(engine.action_passed('BLINK',unfinished,baseline))
 def test_multiple_faces_and_invalid_document_are_not_accepted(self):
  with self.assertRaises(Exception):read_image(b'not an image')
  self.assertIsNone(engine.detect(np.zeros((480,640,3),dtype=np.uint8)))
 def test_pad_logits_finite_and_correct_shape(self):
  for model,_ in engine.PAD:
   model.setInput(np.zeros((1,3,80,80),dtype=np.float32));prediction=model.forward();self.assertEqual(prediction.size,3);self.assertTrue(np.isfinite(prediction).all())

 def test_15fps_camera_collects_enough_neutral_pad_samples_for_live_tasks(self):
  # Actual 14-second video and timestamps; mock the vision models only.
  # The former every-ninth-frame PAD schedule yielded just 9 samples at 15fps.
  frame=np.random.default_rng(42).integers(0,256,(480,640,3),dtype=np.uint8)
  samples=[]
  for n in range(210):
   samples.append({'yaw':0,'pitch':.4,'eye':.1 if n in (130,131) else .25,'mouth':.30 if 35<=n<=65 else .03})
  face=np.array([120,120,180,180]+[0]*11,dtype=np.float32)
  result=SimpleNamespace(multi_face_landmarks=[SimpleNamespace(landmark=[])])
  mesh=unittest.mock.MagicMock();mesh.__enter__.return_value.process.return_value=result
  with tempfile.TemporaryDirectory() as root:
   path=Path(root)/'15fps.mp4';writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),15,(640,480))
   for _ in range(210):writer.write(frame)
   writer.release()
   with patch.object(engine,'detect',return_value=face),patch.object(engine,'pose',side_effect=samples),patch.object(engine,'vector',return_value=np.ones(128)/np.sqrt(128)),patch.object(engine,'pad',return_value=[1.,1.]) as pad,patch.object(engine.mp.solutions.face_mesh,'FaceMesh',return_value=mesh):
    checked=engine.verify(path,['OPEN_MOUTH','BLINK'])
   self.assertEqual(checked['verdict'],'PASS',checked.get('reason'))
   self.assertGreaterEqual(pad.call_count,10)

if __name__=='__main__':unittest.main()
