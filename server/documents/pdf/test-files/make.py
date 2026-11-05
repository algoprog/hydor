# The test PDFs of server/documents/pdf/pdf-test.ts, all made here:
#   form.pdf and its copies: this script, with reportlab and pypdf (pip install reportlab pypdf cryptography):
#     a form of every kind of field over two pages; copies encrypted with an empty user password (RC4 40 and 128,
#     AES 128 and 256), one that needs a password (form-locked.pdf), and one with an incremental update by pypdf.
#   form-signed.pdf: form.pdf signed by poppler's pdfsig with a throwaway self-signed certificate:
#     certutil -N -d sql:nss --empty-password
#     openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=Test Signer/O=Hydor tests"
#     openssl pkcs12 -export -inkey key.pem -in cert.pem -out signer.p12 -passout pass:x -name signer
#     pk12util -i signer.p12 -d sql:nss -W x && certutil -M -n signer -t "CT,C,C" -d sql:nss
#     pdfsig -nssdir sql:nss -add-signature -nick signer -new-signature-field-name Approval -reason "Approved for testing" form.pdf form-signed.pdf
#   tex-form.pdf: pdflatex tex-form-source.tex (hyperref's form fields; a cross-reference stream and object streams).
#   printed-form.pdf: LibreOffice from printed-form-source.fodt (soffice --headless --convert-to pdf): a form that is
#     only printed labels and lines, with Greek, in a classic cross-reference table.
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import black, white, HexColor
import pypdf, sys

c = canvas.Canvas('form.pdf', pagesize=A4)
c.setTitle('Volunteer sign-up')
c.setFont('Helvetica-Bold', 16)
c.drawString(60, 790, 'Volunteer sign-up')
c.setFont('Helvetica', 11)
f = c.acroForm
c.drawString(60, 740, 'First name:')
f.textfield(name='first_name', tooltip='First name', x=160, y=732, width=200, height=20, borderStyle='inset', forceBorder=True)
c.drawString(60, 710, 'Last name:')
f.textfield(name='last_name', tooltip='Last name', x=160, y=702, width=200, height=20, forceBorder=True)
c.drawString(60, 680, 'Age:')
f.textfield(name='age', x=160, y=672, width=60, height=20, maxlen=3, forceBorder=True)
c.drawString(60, 650, 'Notes:')
f.textfield(name='notes', x=160, y=590, width=300, height=70, fieldFlags='multiline', forceBorder=True)
f.checkbox(name='agree', tooltip='I agree to the terms', x=60, y=555, size=14, buttonStyle='check', checked=False)
c.drawString(80, 557, 'I agree to the terms')
c.drawString(60, 525, 'Shift:')
for i, (v, label) in enumerate([('morning', 'Morning'), ('afternoon', 'Afternoon'), ('evening', 'Evening')]):
    f.radio(name='shift', value=v, x=110 + i * 110, y=522, size=14, buttonStyle='circle', selected=(v == 'afternoon'))
    c.drawString(128 + i * 110, 525, label)
c.drawString(60, 490, 'Team:')
f.choice(name='team', options=['Kitchen', 'Garden', 'Front desk'], value='Garden', x=160, y=482, width=150, height=20, forceBorder=True)
c.drawString(60, 455, 'Skills:')
f.listbox(name='skills', options=['Cooking', 'Driving', 'First aid', 'Languages'], value=['Driving'], x=160, y=390, width=150, height=70, fieldFlags='multiSelect', forceBorder=True)
c.drawString(60, 340, 'Signature: ______________________________        Date: ______________')
c.showPage()
c.setFont('Helvetica', 11)
c.drawString(60, 790, 'Page two: emergency contact')
c.drawString(60, 740, 'Contact name:')
f.textfield(name='contact', x=160, y=732, width=200, height=20, forceBorder=True)
c.save()

r = pypdf.PdfReader('form.pdf')
# Encrypted copies: the user password empty, an owner password set, filling allowed.
for alg, name in [('RC4-40', 'form-rc4-40.pdf'), ('RC4-128', 'form-rc4-128.pdf'), ('AES-128', 'form-aes128.pdf'), ('AES-256', 'form-aes256.pdf')]:
    w = pypdf.PdfWriter(clone_from=r)
    w.encrypt(user_password='', owner_password='owner-secret', algorithm=alg, permissions_flag=pypdf.constants.UserAccessPermissions.PRINT | pypdf.constants.UserAccessPermissions.FILL_FORM_FIELDS | pypdf.constants.UserAccessPermissions.ADD_OR_MODIFY | pypdf.constants.UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS | pypdf.constants.UserAccessPermissions.MODIFY | pypdf.constants.UserAccessPermissions.ASSEMBLE_DOC)
    w.write(name)
# One that needs a password to open.
w = pypdf.PdfWriter(clone_from=r)
w.encrypt(user_password='letmein', owner_password='owner', algorithm='AES-128')
w.write('form-locked.pdf')
# An incremental update already in the file: a field filled by pypdf.
w = pypdf.PdfWriter('form.pdf', incremental=True)
w.update_page_form_field_values(w.pages[0], {'first_name': 'Maria'}, auto_regenerate=False)
w.write('form-updated.pdf')
print('ok')
