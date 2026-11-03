"""Create the blank organization registration application (python-docx)."""
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.section import WD_SECTION_START, WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web/downloads/registration-application.docx'
navy, green, gray = '073D66', '007A4D', '53656B'
doc = Document()
normal = doc.styles['Normal']; normal.font.name = 'Arial'; normal.font.size = Pt(10)
normal.paragraph_format.space_after = Pt(3)
for name in ['Heading 1','Heading 2']:
    doc.styles[name].font.name='Arial'; doc.styles[name].font.color.rgb=RGBColor.from_string(navy)
    doc.styles[name].font.size=Pt(12)
    doc.styles[name].paragraph_format.space_before=Pt(8)
    doc.styles[name].paragraph_format.space_after=Pt(5)

def setup(section, landscape=False):
    section.orientation=WD_ORIENT.LANDSCAPE if landscape else WD_ORIENT.PORTRAIT
    section.page_width=Cm(29.7 if landscape else 21)
    section.page_height=Cm(21 if landscape else 29.7)
    section.top_margin=Cm(1.5); section.bottom_margin=Cm(1.4)
    section.left_margin=Cm(1.7); section.right_margin=Cm(1.7)
    section.header_distance=Cm(.6); section.footer_distance=Cm(.65)

setup(doc.sections[0])
header=doc.sections[0].header.paragraphs[0]
header.add_run('ЕРСИ ГБО').bold=True
header.runs[0].font.color.rgb=RGBColor.from_string(green)
header.add_run('  |  РЕГИСТРАЦИЯ ОРГАНИЗАЦИИ').font.size=Pt(8)
footer=doc.sections[0].footer.paragraphs[0]
footer.add_run('Анкета-заявка • редакция 1 от 03.11.2026  |  Стр. ').font.size=Pt(8)
f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');footer._p.append(f)


def line(text, size=9, color=gray):
    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(4)
    r=p.add_run(text);r.font.size=Pt(size);r.font.color.rgb=RGBColor.from_string(color)
    return p

def shade(cell, fill):
    p=OxmlElement('w:shd');p.set(qn('w:fill'),fill);cell._tc.get_or_add_tcPr().append(p)

def borders(table):
    node=OxmlElement('w:tblBorders')
    for edge in ['top','left','bottom','right','insideH','insideV']:
        e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D4E1DA');node.append(e)
    table._tbl.tblPr.append(node)

def fields(rows):
    table=doc.add_table(rows=0, cols=2);table.alignment=WD_TABLE_ALIGNMENT.CENTER
    borders(table);table.autofit=False;table.columns[0].width=Cm(6.6);table.columns[1].width=Cm(11)
    for label,helptext in rows:
        row=table.add_row();row.height=Cm(.90);row.height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST
        for cell in row.cells: cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(row.cells[0],'F0F6F3')
        for i,text in enumerate([label,helptext or '']):
            p=row.cells[i].paragraphs[0];p.paragraph_format.space_after=Pt(2);p.paragraph_format.space_before=Pt(2)
            run=p.add_run(text);run.font.size=Pt(9.2 if i==0 else 9)
            if i==0: run.bold=True
            else:run.font.color.rgb=RGBColor.from_string('78888A')
        cant=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(cant)
    return table

p=doc.add_paragraph();p.paragraph_format.space_after=Pt(6)
r=p.add_run('АНКЕТА-ЗАЯВКА\nНА РЕГИСТРАЦИЮ В ЕРСИ ГБО');r.bold=True;r.font.size=Pt(17);r.font.color.rgb=RGBColor.from_string(navy)
line('Заполните все применимые поля. Не применимые поля отметьте «НЕ ПРИМЕНИМО».\nТелефоны — +7XXXXXXXXXX; даты — ДД.ММ.ГГГГ. Поля со знаком * обязательны.',9)
doc.add_heading('1. ОРГАНИЗАЦИЯ',level=1)
line('Тип организации*:  ☐ ИНСПЕКЦИОННЫЙ ОРГАН     ☐ КОНТРОЛЬНЫЙ ОРГАН',10,navy)
fields([
 ('Полное юридическое наименование*','Как в регистрационных документах, с организационно-правовой формой'),
 ('Наименование для отображения*','Название, которое будет видно в системе'),
 ('БИН организации*','12 цифр: __ __ __ __ __ __ __ __ __ __ __ __'),
 ('Область / регион*',''),('Город / населённый пункт*',''),
 ('Юридический адрес*','Индекс, город, улица, дом, офис'),('Фактический / рабочий адрес*','Если совпадает с юридическим, напишите «СОВПАДАЕТ»'),
 ('Координаты рабочего пункта','Если известны: широта __________________; долгота __________________'),
 ('Контактный телефон организации*','+7________________________________'),('Электронная почта организации*','________________________________@________________'),
])
doc.add_heading('2. РУКОВОДИТЕЛЬ ОРГАНИЗАЦИИ',level=1)
fields([
 ('Фамилия, имя, отчество*','Полностью; отчество — при наличии'),
 ('Должность*',''),('Личный телефон для входа*','+7________________________________'),
 ('Город проживания*',''),('ИИН (если предоставляется)','12 цифр; поле необязательное'),
])
line('Руководителю инспекционного органа предоставляется роль «Руководитель ИО».\nРуководитель контрольного органа регистрируется с доступом контрольного органа; его должность указывается отдельно.',8.5)
line('Дата заполнения: ____ . ____ . ________     Контакт для уточнений: __________________________',9,navy)

section=doc.add_section(WD_SECTION_START.NEW_PAGE);setup(section)
doc.add_heading('3. АККРЕДИТАЦИЯ ИНСПЕКЦИОННОГО ОРГАНА',level=1)
line('Для инспекционного органа период аккредитации обязателен. Для контрольного органа укажите «НЕ ПРИМЕНИМО», если он не имеет аттестата аккредитации.')
fields([('Номер аттестата (для проверки)',''),('Дата начала действия*','____ . ____ . ________'),('Дата окончания действия*','____ . ____ . ________'),('Кем выдан аттестат',''),('Область / вид деятельности','')])
doc.add_heading('4. РЕКВИЗИТЫ ОРГАНИЗАЦИИ',level=1)
line('Реквизиты для договоров и расчётных документов. Если поле не применяется, укажите «НЕ ПРИМЕНИМО».')
fields([('Получатель / владелец счёта','Полное юридическое наименование'),('Наименование банка',''),('ИИК / IBAN','KZ________________________________________________'),('БИК банка',''),('КБе','__ __'),('Валюта счёта',''),('Плательщик НДС','☐ ДА     ☐ НЕТ'),('Регистрационные данные НДС','Если применимо: номер и дата')])
doc.add_heading('5. ПРИЛОЖЕНИЯ И ПОДТВЕРЖДЕНИЕ',level=1)
line('☐ Список сотрудников (страница 3; при необходимости добавьте листы).\n☐ Копия аттестата аккредитации — для инспекционного органа.\n☐ Карточка реквизитов организации — при наличии.',9.3,navy)
line('Прошу зарегистрировать указанную организацию и перечисленных сотрудников в ЕРСИ ГБО с указанными ролями. Подтверждаю достоверность сведений и свои полномочия на подачу заявки.',10,navy)
line('ФИО заявителя: __________________________________________________________________\nДолжность: _______________________________________________________________________\nТелефон для обратной связи: +7______________________________________________________',9.5,navy)
line('Дата: ____ . ____ . ________     Подпись: __________________     М.П. (при наличии)',10,navy)
line('Пароли в анкете не указываются. Данные для первого входа передаёт администратор отдельно. Заполненная анкета передаётся администратору системы и не предназначена для публичного размещения.',8.5)

section=doc.add_section(WD_SECTION_START.NEW_PAGE);setup(section,True)
doc.add_heading('6. СПИСОК СОТРУДНИКОВ ДЛЯ РЕГИСТРАЦИИ',level=1)
line('Организация: __________________________________________________________   БИН: __________________________   Лист списка № ____',9.5,navy)
line('Роли: 1 — Руководитель ИО; 2 — Инспектор; 3 — Контроль качества; 4 — Сотрудник контрольного органа.\nДля инспекционного органа используйте роли 1–3, для контрольного органа — роль 4. Руководителя со страницы 1 повторно не включайте.',9)
headers=['№','Фамилия, имя, отчество*\n(полностью)','Телефон для входа*\n+7XXXXXXXXXX','ИИН\n(необязательно)','Город\nпроживания*','Код роли*\n1 / 2 / 3 / 4','Должность\nв организации*','Учётная запись\nуже есть?\nДа / нет*']
widths=[.8,5.8,3.5,3.1,3.1,2.2,4.1,3.7]
table=doc.add_table(rows=1,cols=8);borders(table);table.autofit=False;table.alignment=WD_TABLE_ALIGNMENT.CENTER
for col,w in zip(table.columns,widths):col.width=Cm(w)
for i,title in enumerate(headers):
 cell=table.rows[0].cells[i];cell.width=Cm(widths[i]);shade(cell,navy);p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(3)
 r=p.add_run(title);r.bold=True;r.font.size=Pt(8.5);r.font.color.rgb=RGBColor(255,255,255)
headerrow=OxmlElement('w:tblHeader');table.rows[0]._tr.get_or_add_trPr().append(headerrow)
for n in range(1,11):
 row=table.add_row();row.height=Cm(.93);row.height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST
 cant=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(cant)
 for i,cell in enumerate(row.cells):
  shade(cell,'F0F6F3' if n%2 else 'FFFFFF');p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(0)
  run=p.add_run(str(n) if i==0 else '');run.font.size=Pt(9)
line('Каждый сотрудник — отдельной строкой. Используйте личные номера телефонов; один номер не указывайте для разных людей. Если доступ уже есть, укажите тот же номер — учётная запись привязывается к организации без создания дубликата. При смене номера отдельно укажите старый номер администратору.',8.5)
line('Всего сотрудников в приложенном списке: ________   Подпись руководителя: __________________   Дата: ____ . ____ . ________',9,navy)
OUT.parent.mkdir(parents=True,exist_ok=True)
doc.core_properties.title='Анкета-заявка на регистрацию в ЕРСИ ГБО'
doc.core_properties.subject='Регистрация инспекционного или контрольного органа и сотрудников'
doc.core_properties.author='ЕРСИ ГБО'
doc.save(OUT)
print(OUT)
