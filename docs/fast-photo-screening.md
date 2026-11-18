# Fast photo screening v3.6

The active inspection package contains the application photo and work/report
files. The applicant questionnaire is no longer displayed or required, including
quality review and resumed older drafts. Existing stored records are retained;
legacy upload identifiers remain compatible while already-open clients update.
Active inspection/certificate responses omit the retired document.

Automatic photo decisions are limited to severe blur/unreadable blank frames and
screen replay evidence. Lighting, paper/book borders, isolated bands/frames,
resolution advice and blanket label-originality warnings are removed. The label
preview keeps retake/confirmation without an additional context checkbox.

An original is decoded once into a bounded RGB sample. A linear focus check and
small screen sample share it. Local device inference remains for cylinder labels
or an enclosed display-like frame, with a two-second deadline. Paper/book outputs
are ignored. Failed inference requests explicit screen review rather than claiming
a successful screen check. The normal quality workflow remains mandatory.

Original upload/storage bytes are unchanged. Existing size, format and decoder
resource limits still protect the server. PDFs retain their existing content/VIN
checks because those are not photo-quality heuristics.

On a synthetic 12-megapixel JPEG, five measured warmed runs with one Sharp thread
and native cache disabled had median preprocessing times of 241 ms before and
57 ms after (4.23x). Network transfer and model inference are excluded. A public
monitor replay fixture still met the two-view screen threshold after the new
analysis derivative (0.930 confidence, 0.877 mirrored agreement).

Inspector video verification and session guards, inspection address validation,
photo coordinate capture and draft coordinate persistence remain unchanged.
