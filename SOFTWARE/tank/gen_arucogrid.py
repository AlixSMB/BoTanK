import numpy as np
import cv2
import cv2.aruco as aruco

from util import getGridMarkers # util.py 

aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)

margin = 1/2
nb_w = 8
nb_h = 5
ids, corners = getGridMarkers(nb_w, nb_h, 1, 1)
scale = (6+2)*10 # size of marker in pixels, better if proportional to number of internal bits (marker + margin bits)

bgimg = np.full((round(1920*210/297), 1920), 255)
for i in range(len(ids)):
	markerimg = aruco.drawMarker(aruco_dict, ids[i], scale)
	
	xl = round(corners[i][0][0]*scale)
	xr = round(corners[i][1][0]*scale)
	yt = round(corners[i][0][1]*scale)
	yb = round(corners[i][2][1]*scale)
	
	bgimg[yt:yb, xl:xr] = markerimg
	
	#while True:
	#	cv2.imshow("test", bgimg)
	#	if cv2.waitKey(0) == ord('q') : break

OUT_FILE=f"boards/aruco_grid-6X6_250-{nb_w}_{nb_h}.png"
cv2.imwrite(OUT_FILE, bgimg)
print(f"Aruco grid written to \"{OUT_FILE}\"")
