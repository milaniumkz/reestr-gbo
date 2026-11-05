import math
from pathlib import Path
import argparse
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
import fitz
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--output',default=str(ROOT/'web'/'downloads'))
args=parser.parse_args()
D=str(ROOT/'docs'/'observer-instruction')+'/'
O=str(Path(args.output).resolve())+'/'
Path(O).mkdir(parents=True,exist_ok=True)
for n,f in [('R','DejaVuSans.ttf'),('B','DejaVuSans-Bold.ttf')]: pdfmetrics.registerFont(TTFont(n,'/usr/share/fonts/truetype/dejavu/'+f))
W,H=595.276,841.89
c=canvas.Canvas(O+'observer-instruction-ersigbo-a4.pdf',pagesize=(W,H))
c.setTitle('ЕРСИ ГБО — инструкция для наблюдателя')
green=HexColor('#007A4D'); dark=HexColor('#003C2B'); muted=HexColor('#49645B'); orange=HexColor('#E45C2E')
def text(x,y,s,size=10,font='R',color=dark):
 c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,s)
def para(x,y,s,width=230,size=10,leading=14,color=muted):
 p=Paragraph(s,ParagraphStyle('p',fontName='R',fontSize=size,leading=leading,textColor=color));_,h=p.wrap(width,100);p.drawOn(c,x,y-h);return h
def arrow(x1,y1,x2,y2):
 c.setStrokeColor(white);c.setLineWidth(6);c.line(x1,y1,x2,y2)
 c.setStrokeColor(orange);c.setLineWidth(3);c.setLineCap(1);c.line(x1,y1,x2,y2)
 a=math.atan2(y2-y1,x2-x1);p=c.beginPath();p.moveTo(x2,y2)
 for d in [-.48,.48]:p.lineTo(x2-10*math.cos(a+d),y2-10*math.sin(a+d))
 p.close();c.setFillColor(orange);c.drawPath(p,fill=1,stroke=0)
def shot(name,crop,x,y,w):
 x0,y0,x1,y1=crop;scale=w/(x1-x0);h=(y1-y0)*scale
 c.saveState();p=c.beginPath();p.rect(x,y,w,h);c.clipPath(p,stroke=0)
 c.drawImage(D+name,x-x0*scale,y-(1600-y1)*scale,width=860*scale,height=1600*scale)
 c.restoreState()
 return lambda px,py:(x+(px-x0)*scale,y+(y1-py)*scale)
c.setFillColor(HexColor('#F3F7F4'));c.rect(0,0,W,H,fill=1,stroke=0)
c.setFillColor(dark);c.rect(0,H-142,W,142,fill=1,stroke=0)
text(28,H-30,'ЕРСИ ГБО  /  ДЛЯ НАБЛЮДАТЕЛЯ',10,'B',HexColor('#9DDCC0'))
text(28,H-62,'Как проверить свидетельство ГБО',23,'B',white)
text(28,H-87,'Наведите камеру на QR-код выше и откройте ссылку.',10,'R',white)
text(28,H-117,'Если QR не сканируется, введите в браузере:',9,'R',white)
c.setFillColor(white); c.roundRect(377,H-132,190,34,9,fill=1,stroke=0)
text(398,H-121,'ersigbo.kz',20,'B',dark)
c.linkURL('https://ersigbo.kz/',(377,H-132,567,H-98),relative=0)
# Four sequential cards
cards=[(28,420),(305,420),(28,120),(305,120)]
info=[('Выберите «Наблюдатель»','На главном экране нажмите кнопку<br/>«Наблюдатель (проверка свидетельства ГБО)».','01-home.png',(0,1185,860,1495)),('Введите данные и найдите','Полный госномер, включая код региона,<br/>и последние 3 символа VIN из техпаспорта.','02-form.png',(0,720,860,1095)),('Откройте свидетельство','Прокрутите страницу вниз и нажмите<br/>на найденную карточку свидетельства.','03-result.png',(0,690,860,1385)),('Сверьте сведения','Проверьте статус, срок действия,<br/>госномер и полный VIN автомобиля.','04-detail.png',(0,250,860,835))]
for i,((x,y),(title,desc,file,crop)) in enumerate(zip(cards,info),1):
 c.setFillColor(white);c.roundRect(x,y,262,284,14,fill=1,stroke=0)
 c.setFillColor(green);c.circle(x+25,y+259,13,fill=1,stroke=0)
 text(x+21,y+255,str(i),12,'B',white)
 text(x+45,y+255,title,10.2,'B')
 para(x+14,y+235,desc,234,9,12)
 # screenshots stay at their true aspect ratio
 iw=234; ih=(crop[3]-crop[1])*iw/860
 sy=y+18+(183-ih)/2
 f=shot(file,crop,x+14,sy,iw)
 if i==1:
  a=f(760,1390);b=f(650,1300);arrow(*a,*b)
  para(x+18,y+42,'Если появилось окно установки —<br/>нажмите «Позже».',225,9,12)
 elif i==2:
  arrow(*f(755,745),*f(620,790));arrow(*f(755,870),*f(620,910));arrow(*f(745,1080),*f(650,1035))
  para(x+18,y+34,'Затем нажмите «Найти свидетельство».',230,8.6,12)
 elif i==3: arrow(*f(740,1020),*f(590,975))
 else:
  arrow(*f(710,400),*f(520,420));arrow(*f(720,740),*f(590,800))
c.setFillColor(HexColor('#E1EEE5'));c.roundRect(28,37,539,68,12,fill=1,stroke=0)
text(42,86,'Свидетельство не найдено?',10,'B')
para(42,76,'Проверьте госномер и последние 3 символа VIN. Если данные верны,<br/>обратитесь в инспекционный орган, выдавший свидетельство.',510,9,12)
text(28,20,'Без регистрации и пароля',8,'B',green)
c.setFont('R',7);c.setFillColor(muted);c.drawRightString(567,20,'Скриншоты с учебными данными • 05.11.2026')
c.showPage();c.save()
doc=fitz.open(O+'observer-instruction-ersigbo-a4.pdf');page=doc[0];page.get_pixmap(matrix=fitz.Matrix(300/72,300/72)).save(O+'observer-instruction-ersigbo-a4.png');page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(O+'observer-instruction-preview.png')
print('PDF pages:',len(doc),'PNG: 2481 × 3508 px')
