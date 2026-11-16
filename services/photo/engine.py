"""Private, bounded, in-memory analysis. Never mount user uploads or secrets."""
import json,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from detector import Detector,read_frame,MAX_BYTES

class Handler(BaseHTTPRequestHandler):
    detector=None
    lock=threading.Lock()
    def log_message(self,*args):pass
    def reply(self,code,value):
        body=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path!='/health':return self.reply(404,{})
        self.reply(200,{'ready':self.detector is not None,'model':self.detector.model,'externalServices':False})
    def do_POST(self):
        if self.path!='/analyze':return self.reply(404,{})
        try:size=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.reply(400,{})
        if not 0<size<=MAX_BYTES:return self.reply(413,{})
        if not self.lock.acquire(blocking=False):return self.reply(503,{'error':'busy'})
        try:
            self.connection.settimeout(5);raw=self.rfile.read(size)
            if len(raw)!=size:return self.reply(400,{})
            self.reply(200,self.detector.analyze(read_frame(raw)))
        except Exception:self.reply(422,{'error':'analysis_failed'})
        finally:self.lock.release()

if __name__=='__main__':
    Handler.detector=Detector();ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
