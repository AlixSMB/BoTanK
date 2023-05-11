import numpy as np
import cv2

# screen pixels size
#screenname = 'VS228N'
#diagonal = 0.546 # m
#wpx = 1920
#hpx = 1080
#diagonalpx = (wpx**2 + hpx**2)**(1/2)
#pxPerM = diagonalpx/diagonal
screenname = 'LAPTOP HP'
diagonal = 0.3556 # m
hauteur = 0.174 # m
wpx = 1366
hpx = 768
pxPerM = hpx/hauteur
#screenname = 'GL2580HM'
#diagonal = 0.6223 # m
#wpx = 1920
#hpx = 1080
#diagonalpx = (wpx**2 + hpx**2)**(1/2)
#pxPerM = diagonalpx/diagonal

print(f"Using config for \"{screenname}\" screen")

chess_s = 0.02 # cell size in meters
print(f"Using a cell size of {chess_s} m")
chess_s_px = round(chess_s*pxPerM)
chess_w = 13
chess_h = 7
print(f"Using a {chess_w}x{chess_h} grid")

margin = 50 # px
img = np.full((margin*2 + chess_s_px*chess_h, margin*2 + chess_s_px*chess_w), 255, dtype=np.float64)
for i in range(chess_h):
	for n in range(chess_w):
		img[
			margin+i*chess_s_px : margin+(i+1)*chess_s_px,
			margin+n*chess_s_px : margin+(n+1)*chess_s_px
		] = 0 if n%2==i%2 else 255

while True:
	
	cv2.imshow("image", img)
	keycode = cv2.waitKey(round(1000/30))
	if keycode == ord('q') : break
