import sys, torch, numpy as np, cv2
from spandrel import ModelLoader
inp, wpath, out, dn = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
m = ModelLoader().load_from_file(wpath).eval()
img = cv2.imread(inp)[:, :, ::-1].astype(np.float32) / 255
pad = 16
img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REFLECT)
t = torch.from_numpy(img.transpose(2, 0, 1).copy())[None]
with torch.no_grad():
    y = m(t)
y = y[0].clamp(0, 1).numpy().transpose(1, 2, 0)
s = m.scale; y = y[pad*s:-pad*s, pad*s:-pad*s]
cv2.imwrite(out, (y[:, :, ::-1] * 255 + 0.5).astype(np.uint8))
print('ok', out, y.shape)
