#!/usr/bin/env python3
"""Build a minimal one-page PDF (no dependencies) for upload testing."""
import re

lines = [
    "Cell Membranes - Study Notes",
    "",
    "1. The fluid mosaic model",
    "The cell membrane is a phospholipid bilayer. Each phospholipid has a",
    "hydrophilic (water-loving) head and two hydrophobic (water-fearing) tails.",
    "In water, the tails hide inside while the heads face outward. Proteins float",
    "in this bilayer like icebergs, which is why it is called a mosaic.",
    "",
    "2. Membrane proteins",
    "Integral proteins span the whole bilayer and act as channels or carriers.",
    "Peripheral proteins sit on the surface and work as enzymes or signals.",
    "Carbohydrate chains attached to proteins form the glycocalyx, used for",
    "cell recognition.",
    "",
    "3. Selective permeability",
    "Small nonpolar molecules (O2, CO2) diffuse freely across. Ions and large",
    "polar molecules need transport proteins. Osmosis is the diffusion of water",
    "across a selectively permeable membrane, from low to high solute concentration.",
]

def esc(t):
    return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

content = "BT /F1 14 Tf 50 740 Td 18 TL\n"
for ln in lines:
    content += f"({esc(ln)}) Tj T*\n"
content += "ET"
cbytes = content.encode("latin-1")

objs = []
objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
objs.append(b"<< /Length " + str(len(cbytes)).encode() + b" >>\nstream\n" + cbytes + b"\nendstream")
objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

pdf = b"%PDF-1.4\n"
offsets = []
for i, body in enumerate(objs, start=1):
    offsets.append(len(pdf))
    pdf += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
xref_pos = len(pdf)
pdf += f"xref\n0 {len(objs)+1}\n".encode()
pdf += b"0000000000 65535 f \n"
for o in offsets:
    pdf += f"{o:010d} 00000 n \n".encode()
pdf += (f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF").encode()

with open("/home/hatch/workspace/hello_sensei-v1/e2e/cell-membrane-notes.pdf", "wb") as f:
    f.write(pdf)
print("wrote", len(pdf), "bytes")
