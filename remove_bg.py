from PIL import Image
import numpy as np

img = Image.open(r"C:\Users\EMILIANO\contable-platform\Praxis IA.png").convert("RGBA")
data = np.array(img)

r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]

# Detectar el color de fondo tomando el pixel de la esquina superior izquierda
bg_r, bg_g, bg_b = int(r[0,0]), int(g[0,0]), int(b[0,0])
print(f"Color de fondo detectado: R={bg_r} G={bg_g} B={bg_b}")

# Tolerancia para capturar variaciones del color de fondo
tolerance = 30

mask = (
    (np.abs(r.astype(int) - bg_r) < tolerance) &
    (np.abs(g.astype(int) - bg_g) < tolerance) &
    (np.abs(b.astype(int) - bg_b) < tolerance)
)

data[mask, 3] = 0  # poner transparente

result = Image.fromarray(data)
out = r"C:\Users\EMILIANO\contable-platform\frontend\public\praxis-logo.png"
result.save(out, "PNG")
print(f"Guardado en: {out}")
