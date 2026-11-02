"""Generate the functional web QR with the application's real icon (qrcode[pil])."""
from pathlib import Path
import qrcode
from qrcode.image.styledpil import StyledPilImage

root = Path(__file__).resolve().parents[1]
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=24, border=4)
qr.add_data('https://89-207-255-42.sslip.io/')
qr.make(fit=True)
qr.make_image(image_factory=StyledPilImage,
              embedded_image_path=str(root / 'web/icons/Icon-512.png'),
              embedded_image_ratio=.20).save(root / 'web/downloads/ersi-gbo-web-qr.png')
